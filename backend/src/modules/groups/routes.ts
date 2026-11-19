import { Hono } from 'hono';
import { nanoid, customAlphabet } from 'nanoid';
import {
  CreateGroupSchema,
  UpdateGroupSchema,
  UpdateGroupSettingsSchema,
  GROUP_CODE_ALPHABET,
  GROUP_CODE_LENGTH,
  formatGroupCode
} from '@tinhtien/shared';

// Mã tham gia dễ đọc: K7MQ4XPZ (hiển thị K7MQ-4XPZ)
const generateGroupCode = customAlphabet(GROUP_CODE_ALPHABET, GROUP_CODE_LENGTH);
import type { AppEnv } from '../../middleware/groupAuth.js';
import { requireGroup, invalidateGroupCache } from '../../middleware/groupAuth.js';
import { getDb } from '../../db/db.js';
import { logAudit, broadcastGroupEvent } from '../../services/realtime.js';
import {
  loadMembersWithBank,
  loadMappedObligations,
  loadTotalExpense,
  listPaymentsWithRecipient,
  computeBalances,
  buildPersonal
} from '../../services/snapshot.js';

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
  // Gần như không thể trùng, nhưng vẫn kiểm tra cho chắc (UNIQUE ở DB là chốt chặn cuối)
  let publicCode = generateGroupCode();
  for (let i = 0; i < 3; i++) {
    const exists = await db.queryFirst<{ id: string }>(`SELECT id FROM groups WHERE public_code = ?`, [publicCode]);
    if (!exists) break;
    publicCode = generateGroupCode();
  }
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
      displayCode: formatGroupCode(publicCode),
      inviteUrl: `/group/${publicCode}`
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
// Toàn bộ truy vấn chạy song song, không có truy vấn lặp N+1 -> rows read D1 ổn định theo kích thước nhóm.
groupsRouter.get('/:groupCode/sync', requireGroup, async (c) => {
  const group = c.get('group');
  const currentMember = c.get('currentMember');
  const db = getDb(c.env);

  const [members, settings, mappedObligations, totalExpense, payments, activities, notifications] = await Promise.all([
    loadMembersWithBank(db, group.id),
    db.queryFirst<any>(
      `SELECT reminder_day_of_week, reminder_hour, is_reminder_enabled FROM group_settings WHERE group_id = ?`,
      [group.id]
    ),
    loadMappedObligations(db, group.id),
    loadTotalExpense(db, group.id),
    listPaymentsWithRecipient(db, group.id),
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
    currentMember
      ? db.queryAll<any>(
          `SELECT * FROM notifications
           WHERE group_id = ? AND (target_member_id IS NULL OR target_member_id = ?)
           ORDER BY created_at DESC LIMIT 30`,
          [group.id, currentMember.id]
        )
      : db.queryAll<any>(
          `SELECT * FROM notifications
           WHERE group_id = ? AND target_member_id IS NULL
           ORDER BY created_at DESC LIMIT 30`,
          [group.id]
        )
  ]);

  const balances = computeBalances(members, mappedObligations);
  const { netBalances, pairwiseDebts, settlementProposals } = balances;
  const personal = currentMember ? buildPersonal(currentMember, members, balances, payments) : null;
  const pendingPayments = payments.filter((p: any) => p.status === 'PENDING_CONFIRMATION');

  const formattedNotifications = notifications.map((n: any) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    message: n.message,
    data: n.data ? safeJson(n.data) : null,
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
        settings: settings
          ? {
              reminderDayOfWeek: settings.reminder_day_of_week,
              reminderHour: settings.reminder_hour,
              isReminderEnabled: Boolean(settings.is_reminder_enabled)
            }
          : null
      },
      members,
      dashboard: {
        group: {
          id: group.id,
          name: group.name,
          currency: group.currency,
          totalExpense,
          memberBalances: netBalances
        },
        personal,
        netBalances,
        pairwiseDebts,
        settlementProposals,
        pendingPayments
      },
      activities,
      debts: {
        pairwiseDebts,
        netBalances,
        settlementProposals,
        obligations: mappedObligations
      },
      payments,
      notifications: formattedNotifications
    }
  });
});

function safeJson(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

// Xóa nhóm vĩnh viễn — CHỈ người tạo nhóm (giữ mã chủ nhóm trả về lúc tạo nhóm)
groupsRouter.delete('/:groupCode', requireGroup, async (c) => {
  const group = c.get('group');
  const ownerToken = c.req.header('X-Owner-Token') || '';
  if (!ownerToken || !timingSafeEqual(ownerToken, group.accessToken)) {
    return c.json({ success: false, error: 'Chỉ người tạo nhóm (trên thiết bị đã tạo nhóm) mới được xóa nhóm' }, 403);
  }
  const body = await c.req.json().catch(() => ({}));
  if (typeof body?.confirmName !== 'string' || body.confirmName.trim() !== group.name.trim()) {
    return c.json({ success: false, error: 'Tên nhóm nhập xác nhận không khớp' }, 400);
  }

  const db = getDb(c.env);
  const g = group.id;
  const members = `SELECT id FROM members WHERE group_id = ?`;
  const expenses = `SELECT id FROM expenses WHERE group_id = ?`;
  // Xóa từ bảng con lên bảng cha trong 1 transaction (không phụ thuộc cấu hình cascade)
  const results = await db.batchResults([
    db.prepare(`DELETE FROM payment_allocations WHERE payment_id IN (SELECT id FROM payments WHERE group_id = ?)`, [g]),
    db.prepare(`DELETE FROM payments WHERE group_id = ?`, [g]),
    db.prepare(`DELETE FROM debt_obligations WHERE group_id = ?`, [g]),
    db.prepare(`DELETE FROM debt_adjustments WHERE group_id = ?`, [g]),
    db.prepare(`DELETE FROM activity_revisions WHERE group_id = ?`, [g]),
    db.prepare(`DELETE FROM expense_splits WHERE expense_id IN (${expenses})`, [g]),
    db.prepare(`DELETE FROM expense_payers WHERE expense_id IN (${expenses})`, [g]),
    db.prepare(`DELETE FROM expenses WHERE group_id = ?`, [g]),
    db.prepare(`DELETE FROM activities WHERE group_id = ?`, [g]),
    db.prepare(`DELETE FROM bank_accounts WHERE member_id IN (${members})`, [g]),
    db.prepare(`DELETE FROM member_sessions WHERE group_id = ?`, [g]),
    db.prepare(`DELETE FROM push_subscriptions WHERE group_id = ?`, [g]),
    db.prepare(`DELETE FROM notifications WHERE group_id = ?`, [g]),
    db.prepare(`DELETE FROM audit_logs WHERE group_id = ?`, [g]),
    db.prepare(`DELETE FROM group_settings WHERE group_id = ?`, [g]),
    db.prepare(`DELETE FROM members WHERE group_id = ?`, [g]),
    db.prepare(`DELETE FROM groups WHERE id = ?`, [g])
  ]);
  if (!results.every((r) => r.success) || (results[results.length - 1]?.meta?.changes ?? 0) !== 1) {
    return c.json({ success: false, error: 'Không thể xóa nhóm, vui lòng thử lại' }, 500);
  }

  invalidateGroupCache(group.id, group.publicCode);
  // Báo các thiết bị đang mở nhóm quay về màn hình chính
  await broadcastGroupEvent(c.env, group.id, 'group.deleted', group.id, null, { name: group.name });

  return c.json({ success: true, message: 'Đã xóa nhóm' });
});

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

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
  invalidateGroupCache(group.id, group.publicCode);

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
    `INSERT INTO member_sessions (id, group_id, member_id, token, device_info, last_active_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [nanoid(), group.id, member.id, sessionToken, String(deviceInfo || '').slice(0, 255), now, now]
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
