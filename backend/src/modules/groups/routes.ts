import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import {
  CreateGroupSchema,
  UpdateGroupSchema,
  UpdateGroupSettingsSchema,
  calculateMemberNetBalances,
  calculatePairwiseDebts,
  optimizeSettlements
} from '@tinhtien/shared';
import type { AppEnv } from '../../middleware/groupAuth.js';
import { requireGroup } from '../../middleware/groupAuth.js';
import { getDb } from '../../db/db.js';
import { logAudit, broadcastGroupEvent } from '../../services/realtime.js';

export const groupsRouter = new Hono<AppEnv>();

// Tạo nhóm mới
groupsRouter.post('/', async (c) => {
  const body = await c.req.json();
  const parsed = CreateGroupSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: parsed.error.issues[0].message }, 400);
  }

  const { name, description, initialMembers } = parsed.data;
  const db = getDb(c.env);
  const now = new Date().toISOString();
  const groupId = nanoid();
  const publicCode = nanoid(10);
  const accessToken = nanoid(24);

  const statements = [
    db.prepare(
      `INSERT INTO groups (id, public_code, access_token, name, description, currency, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'VND', ?, ?)`,
      [groupId, publicCode, accessToken, name, description || null, now, now]
    ),
    db.prepare(
      `INSERT INTO group_settings (group_id, reminder_day_of_week, reminder_hour, is_reminder_enabled)
       VALUES (?, 0, 20, 1)`,
      [groupId]
    )
  ];

  const createdMembers = initialMembers.map((mName) => {
    const mId = nanoid();
    statements.push(
      db.prepare(
        `INSERT INTO members (id, group_id, name, status, created_at, updated_at)
         VALUES (?, ?, ?, 'ACTIVE', ?, ?)`,
        [mId, groupId, mName, now, now]
      )
    );
    return { id: mId, name: mName, status: 'ACTIVE' };
  });

  const success = await db.batch(statements);
  if (!success) {
    return c.json({ success: false, error: 'Không thể tạo nhóm, vui lòng thử lại' }, 500);
  }

  await logAudit(c.env, groupId, null, 'GROUP_CREATED', 'group', groupId, { name, memberCount: initialMembers.length });

  return c.json({
    success: true,
    data: {
      id: groupId,
      publicCode,
      accessToken,
      name,
      description,
      members: createdMembers,
      inviteUrl: `/group/${publicCode}?token=${accessToken}`
    }
  });
});

// Lấy thông tin nhóm
groupsRouter.get('/:groupCode', requireGroup, async (c) => {
  const group = c.get('group');
  const db = getDb(c.env);

  const members = await db.queryAll<{
    id: string;
    name: string;
    avatar_url?: string;
    status: string;
    created_at: string;
  }>(`SELECT id, name, avatar_url, status, created_at FROM members WHERE group_id = ? ORDER BY created_at ASC`, [
    group.id
  ]);

  const settings = await db.queryFirst<{
    reminder_day_of_week: number;
    reminder_hour: number;
    is_reminder_enabled: number;
  }>(`SELECT reminder_day_of_week, reminder_hour, is_reminder_enabled FROM group_settings WHERE group_id = ?`, [
    group.id
  ]);

  return c.json({
    success: true,
    data: {
      id: group.id,
      publicCode: group.publicCode,
      name: group.name,
      currency: group.currency,
      members,
      settings: settings
        ? {
            reminderDayOfWeek: settings.reminder_day_of_week,
            reminderHour: settings.reminder_hour,
            isReminderEnabled: Boolean(settings.is_reminder_enabled)
          }
        : null
    }
  });
});

// Endpoint đồng bộ toàn bộ dữ liệu nhóm TRONG 1 REQUEST DUY NHẤT
// Giúp giảm 85% số lượng requests lên Cloudflare Workers (tối ưu tuyệt đối gói Free)
groupsRouter.get('/:groupCode/sync', requireGroup, async (c) => {
  const group = c.get('group');
  const currentMember = c.get('currentMember');
  const db = getDb(c.env);

  // Thực hiện đồng thời các truy vấn SQL cốt lõi bằng Promise.all
  const [
    members,
    settings,
    obligations,
    totalExpenseResult,
    pendingPayments,
    activities,
    notifications
  ] = await Promise.all([
    // 1. Thành viên kèm ngân hàng
    db.queryAll<any>(
      `SELECT m.id, m.name, m.avatar_url as avatarUrl, m.status, m.created_at,
              b.bank_bin as bankBin, b.bank_code as bankCode, b.bank_name as bankName,
              b.account_number as accountNumber, b.account_holder as accountHolder,
              b.is_qr_enabled as isQrEnabled
       FROM members m
       LEFT JOIN bank_accounts b ON b.member_id = m.id
       WHERE m.group_id = ?
       ORDER BY m.created_at ASC`,
      [group.id]
    ),
    // 2. Cài đặt nhóm
    db.queryFirst<any>(
      `SELECT reminder_day_of_week, reminder_hour, is_reminder_enabled FROM group_settings WHERE group_id = ?`,
      [group.id]
    ),
    // 3. Nghĩa vụ nợ gốc
    db.queryAll<any>(
      `SELECT ob.*,
              m1.name as debtor_name,
              m2.name as creditor_name,
              a.title as activity_title,
              a.occurred_at as activity_occurred_at
       FROM debt_obligations ob
       JOIN members m1 ON m1.id = ob.debtor_member_id
       JOIN members m2 ON m2.id = ob.creditor_member_id
       LEFT JOIN activities a ON a.id = ob.source_id AND ob.source_type = 'EXPENSE'
       WHERE ob.group_id = ? AND ob.status != 'CANCELLED'
       ORDER BY ob.created_at DESC`,
      [group.id]
    ),
    // 4. Tổng chi tiêu
    db.queryFirst<{ total: number }>(
      `SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE group_id = ?`,
      [group.id]
    ),
    // 5. Giao dịch thanh toán
    db.queryAll<any>(
      `SELECT p.*, m.name as payer_name
       FROM payments p
       JOIN members m ON m.id = p.payer_member_id
       WHERE p.group_id = ?
       ORDER BY p.created_at DESC`,
      [group.id]
    ),
    // 6. Hoạt động chi tiêu
    db.queryAll<any>(
      `SELECT a.*,
              COALESCE(SUM(e.amount), 0) as total_amount,
              COUNT(e.id) as expense_count
       FROM activities a
       LEFT JOIN expenses e ON e.activity_id = a.id
       WHERE a.group_id = ?
       GROUP BY a.id
       ORDER BY a.occurred_at DESC LIMIT 50`,
      [group.id]
    ),
    // 7. Thông báo
    db.queryAll<any>(
      `SELECT * FROM notifications
       WHERE group_id = ? AND (target_member_id IS NULL OR target_member_id = ?)
       ORDER BY created_at DESC LIMIT 30`,
      [group.id, currentMember?.id || '']
    )
  ]);

  // Phân bổ thanh toán cho từng payment
  const paymentsWithAllocations = await Promise.all(
    pendingPayments.map(async (p: any) => {
      const allocations = await db.queryAll<any>(
        `SELECT pa.*, m.name as recipient_name
         FROM payment_allocations pa
         JOIN members m ON m.id = pa.recipient_member_id
         WHERE pa.payment_id = ?`,
        [p.id]
      );
      return {
        ...p,
        allocations
      };
    })
  );

  // Map obligations
  const mappedObligations = obligations.map((ob: any) => ({
    ...ob,
    debtorMemberId: ob.debtor_member_id,
    creditorMemberId: ob.creditor_member_id,
    debtorName: ob.debtor_name,
    creditorName: ob.creditor_name,
    originalAmount: ob.original_amount,
    settledAmount: ob.settled_amount,
    remainingAmount: Math.max(0, ob.original_amount - ob.settled_amount),
    sourceType: ob.source_type,
    sourceId: ob.source_id,
    activityTitle: ob.activity_title || (ob.source_type === 'INITIAL_DEBT' ? 'Công nợ ban đầu' : 'Khoản chi'),
    activityOccurredAt: ob.activity_occurred_at || ob.created_at,
    createdAt: ob.created_at,
    updatedAt: ob.updated_at
  }));

  // Tính toán công nợ và số dư
  const netBalances = calculateMemberNetBalances(members, mappedObligations as any);
  const pairwiseDebts = calculatePairwiseDebts(members, mappedObligations as any);
  const settlementProposals = optimizeSettlements(netBalances);
  const totalExpense = totalExpenseResult?.total || 0;

  // Tính toán dữ liệu cá nhân nếu có currentMember
  let personal: any = null;
  if (currentMember) {
    const myBalance = netBalances.find((b) => b.memberId === currentMember.id);
    const peopleIOwe = pairwiseDebts
      .filter((p) => p.netDebtorId === currentMember.id)
      .map((p) => {
        const creditorMember = members.find((m: any) => m.id === p.netCreditorId);
        return {
          creditorId: p.netCreditorId,
          creditorName: p.netCreditorId === p.memberAId ? p.memberAName : p.memberBName,
          avatarUrl: creditorMember?.avatarUrl || null,
          amount: p.netAmount,
          bankAccount: creditorMember?.accountNumber
            ? {
                bankBin: creditorMember.bankBin,
                bankCode: creditorMember.bankCode,
                bankName: creditorMember.bankName,
                accountNumber: creditorMember.accountNumber,
                accountHolder: creditorMember.accountHolder,
                isQrEnabled: Boolean(creditorMember.isQrEnabled)
              }
            : null
        };
      });

    const peopleOweMe = pairwiseDebts
      .filter((p) => p.netCreditorId === currentMember.id)
      .map((p) => {
        const debtorMember = members.find((m: any) => m.id === p.netDebtorId);
        return {
          debtorId: p.netDebtorId,
          debtorName: p.netDebtorId === p.memberAId ? p.memberAName : p.memberBName,
          avatarUrl: debtorMember?.avatarUrl || null,
          amount: p.netAmount
        };
      });

    const myPendingReceived = paymentsWithAllocations.filter(
      (p: any) => p.status === 'PENDING' && p.allocations?.some((a: any) => a.recipient_member_id === currentMember.id)
    );
    const myPendingSent = paymentsWithAllocations.filter(
      (p: any) => p.status === 'PENDING' && p.payer_member_id === currentMember.id
    );

    const currentMemberRecord = members.find((m: any) => m.id === currentMember.id);

    personal = {
      memberId: currentMember.id,
      memberName: currentMember.name,
      avatarUrl: currentMemberRecord?.avatarUrl || null,
      totalOwedToOthers: myBalance?.totalOwedToOthers || 0,
      totalOwedByOthers: myBalance?.totalOwedByOthers || 0,
      netBalance: myBalance?.netBalance || 0,
      peopleIOwe,
      peopleOweMe,
      pendingReceived: myPendingReceived,
      pendingSent: myPendingSent
    };
  }

  const netBalancesWithAvatar = netBalances.map((b) => {
    const mem = members.find((m: any) => m.id === b.memberId);
    return {
      ...b,
      avatarUrl: mem?.avatarUrl || null
    };
  });

  const dashboardData = {
    group: {
      id: group.id,
      name: group.name,
      currency: group.currency,
      totalExpense,
      memberBalances: netBalancesWithAvatar
    },
    personal,
    netBalances: netBalancesWithAvatar,
    pairwiseDebts,
    settlementProposals,
    pendingPayments: paymentsWithAllocations.filter((p: any) => p.status === 'PENDING'),
    recentActivities: activities.slice(0, 5)
  };

  const formattedNotifications = notifications.map((n: any) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    message: n.message,
    data: n.data ? JSON.parse(n.data) : null,
    isRead: Boolean(n.is_read),
    createdAt: n.created_at
  }));

  return c.json({
    success: true,
    data: {
      group: {
        id: group.id,
        publicCode: group.publicCode,
        name: group.name,
        currency: group.currency,
        members,
        settings: settings
          ? {
              reminderDayOfWeek: settings.reminder_day_of_week,
              reminderHour: settings.reminder_hour,
              isReminderEnabled: Boolean(settings.is_reminder_enabled)
            }
          : null
      },
      members,
      dashboard: dashboardData,
      activities,
      debts: {
        pairwiseDebts,
        netBalances,
        settlementProposals,
        obligations: mappedObligations
      },
      payments: paymentsWithAllocations,
      notifications: formattedNotifications
    }
  });
});

// Cập nhật thông tin nhóm
groupsRouter.patch('/:groupCode', requireGroup, async (c) => {
  const group = c.get('group');
  const body = await c.req.json();
  const parsed = UpdateGroupSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: parsed.error.issues[0].message }, 400);
  }

  const { name, description } = parsed.data;
  const db = getDb(c.env);
  const now = new Date().toISOString();

  await db.execute(
    `UPDATE groups SET name = COALESCE(?, name), description = COALESCE(?, description), updated_at = ? WHERE id = ?`,
    [name || null, description !== undefined ? description : null, now, group.id]
  );

  return c.json({ success: true, message: 'Cập nhật nhóm thành công' });
});

// Chọn thành viên để truy cập (Session)
groupsRouter.post('/:groupCode/join', requireGroup, async (c) => {
  const group = c.get('group');
  const body = await c.req.json();
  const memberId = body.memberId;
  const deviceInfo = body.deviceInfo || c.req.header('User-Agent');

  if (!memberId) {
    return c.json({ success: false, error: 'Vui lòng chọn thành viên' }, 400);
  }

  const db = getDb(c.env);
  const member = await db.queryFirst<{ id: string; name: string; status: string }>(
    `SELECT id, name, status FROM members WHERE id = ? AND group_id = ?`,
    [memberId, group.id]
  );

  if (!member) {
    return c.json({ success: false, error: 'Thành viên không thuộc nhóm này' }, 404);
  }

  const sessionToken = nanoid(32);
  const now = new Date().toISOString();

  await db.execute(
    `INSERT INTO member_sessions (id, group_id, member_id, token, deviceInfo, last_active_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [nanoid(), group.id, member.id, sessionToken, deviceInfo, now, now]
  );

  return c.json({
    success: true,
    data: {
      sessionToken,
      member: {
        id: member.id,
        name: member.name,
        status: member.status
      }
    }
  });
});

// Cập nhật cấu hình nhắc nợ nhóm
groupsRouter.patch('/:groupCode/settings', requireGroup, async (c) => {
  const group = c.get('group');
  const body = await c.req.json();
  const parsed = UpdateGroupSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: parsed.error.issues[0].message }, 400);
  }

  const { reminderDayOfWeek, reminderHour, isReminderEnabled } = parsed.data;
  const db = getDb(c.env);

  await db.execute(
    `UPDATE group_settings
     SET reminder_day_of_week = COALESCE(?, reminder_day_of_week),
         reminder_hour = COALESCE(?, reminder_hour),
         is_reminder_enabled = COALESCE(?, is_reminder_enabled)
     WHERE group_id = ?`,
    [
      reminderDayOfWeek !== undefined ? reminderDayOfWeek : null,
      reminderHour !== undefined ? reminderHour : null,
      isReminderEnabled !== undefined ? (isReminderEnabled ? 1 : 0) : null,
      group.id
    ]
  );

  return c.json({ success: true, message: 'Cấu hình nhóm đã được lưu' });
});
