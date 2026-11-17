import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { CreateMemberSchema, UpdateMemberSchema, BankAccountSchema } from '@tinhtien/shared';
import type { AppEnv } from '../../middleware/groupAuth.js';
import { requireGroup } from '../../middleware/groupAuth.js';
import { getDb } from '../../db/db.js';
import { broadcastGroupEvent, logAudit, createNotification } from '../../services/realtime.js';

export const membersRouter = new Hono<AppEnv>();

// Danh sách thành viên kèm thông tin ngân hàng
membersRouter.get('/:groupCode/members', requireGroup, async (c) => {
  const group = c.get('group');
  const db = getDb(c.env);

  const members = await db.queryAll<{
    id: string;
    group_id: string;
    name: string;
    avatar_url: string | null;
    status: string;
    created_at: string;
    bank_bin: string | null;
    bank_code: string | null;
    bank_name: string | null;
    account_number: string | null;
    account_holder: string | null;
    is_qr_enabled: number | null;
  }>(
    `SELECT m.id, m.group_id, m.name, m.avatar_url, m.status, m.created_at,
            b.bank_bin, b.bank_code, b.bank_name, b.account_number, b.account_holder, b.is_qr_enabled
     FROM members m
     LEFT JOIN bank_accounts b ON b.member_id = m.id
     WHERE m.group_id = ?
     ORDER BY m.created_at ASC`,
    [group.id]
  );

  const formatted = members.map((m) => ({
    id: m.id,
    groupId: m.group_id,
    name: m.name,
    avatarUrl: m.avatar_url,
    status: m.status,
    createdAt: m.created_at,
    bankAccount: m.account_number
      ? {
          bankBin: m.bank_bin,
          bankCode: m.bank_code,
          bankName: m.bank_name,
          accountNumber: m.account_number,
          accountHolder: m.account_holder,
          isQrEnabled: Boolean(m.is_qr_enabled)
        }
      : null
  }));

  return c.json({ success: true, data: formatted });
});

// Thêm thành viên mới (BR-05)
membersRouter.post('/:groupCode/members', requireGroup, async (c) => {
  const group = c.get('group');
  const body = await c.req.json();
  const parsed = CreateMemberSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: parsed.error.issues[0].message }, 400);
  }

  const { name, avatarUrl } = parsed.data;
  const db = getDb(c.env);
  const memberId = nanoid();
  const now = new Date().toISOString();

  await db.execute(
    `INSERT INTO members (id, group_id, name, avatar_url, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?)`,
    [memberId, group.id, name, avatarUrl || null, now, now]
  );

  await broadcastGroupEvent(c.env, group.id, 'member.created', memberId, null, { name });
  await logAudit(c.env, group.id, null, 'MEMBER_ADDED', 'member', memberId, { name });
  await createNotification(c.env, group.id, null, 'MEMBER_ADDED', 'Thành viên mới', `${name} đã được thêm vào nhóm.`);

  return c.json({
    success: true,
    data: {
      id: memberId,
      groupId: group.id,
      name,
      avatarUrl,
      status: 'ACTIVE',
      createdAt: now
    }
  });
});

// Cập nhật tên hoặc trạng thái thành viên (BR-02, BR-03, BR-04)
membersRouter.patch('/:groupCode/members/:memberId', requireGroup, async (c) => {
  const group = c.get('group');
  const memberId = c.req.param('memberId');
  const body = await c.req.json();
  const parsed = UpdateMemberSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: parsed.error.issues[0].message }, 400);
  }

  const db = getDb(c.env);
  const member = await db.queryFirst<{ id: string; name: string; status: string }>(
    `SELECT id, name, status FROM members WHERE id = ? AND group_id = ?`,
    [memberId, group.id]
  );

  if (!member) {
    return c.json({ success: false, error: 'Thành viên không tồn tại' }, 404);
  }

  const { name, status, avatarUrl } = parsed.data;
  const now = new Date().toISOString();

  await db.execute(
    `UPDATE members
     SET name = COALESCE(?, name),
         avatar_url = CASE WHEN ? = 1 THEN ? ELSE avatar_url END,
         status = COALESCE(?, status),
         updated_at = ?
     WHERE id = ?`,
    [
      name || null,
      avatarUrl !== undefined ? 1 : 0,
      avatarUrl || null,
      status || null,
      now,
      memberId
    ]
  );

  await broadcastGroupEvent(c.env, group.id, 'member.updated', memberId, null, { name, status, avatarUrl });
  await logAudit(c.env, group.id, null, 'MEMBER_UPDATED', 'member', memberId, {
    old: { name: member.name, status: member.status },
    new: { name: name || member.name, status: status || member.status, avatarUrl }
  });

  return c.json({ success: true, message: 'Cập nhật thành viên thành công' });
});

// Cấu hình tài khoản ngân hàng để nhận VietQR
membersRouter.post('/:groupCode/members/:memberId/bank', requireGroup, async (c) => {
  const group = c.get('group');
  const memberId = c.req.param('memberId');
  const body = await c.req.json();
  const parsed = BankAccountSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: parsed.error.issues[0].message }, 400);
  }

  const db = getDb(c.env);
  const now = new Date().toISOString();
  const { bankBin, bankCode, bankName, accountNumber, accountHolder, isQrEnabled } = parsed.data;

  const existing = await db.queryFirst<{ id: string }>(`SELECT id FROM bank_accounts WHERE member_id = ?`, [
    memberId
  ]);

  if (existing) {
    await db.execute(
      `UPDATE bank_accounts
       SET bank_bin = ?, bank_code = ?, bank_name = ?, account_number = ?, account_holder = ?, is_qr_enabled = ?, updated_at = ?
       WHERE member_id = ?`,
      [bankBin, bankCode, bankName, accountNumber, accountHolder, isQrEnabled ? 1 : 0, now, memberId]
    );
  } else {
    await db.execute(
      `INSERT INTO bank_accounts (id, member_id, bank_bin, bank_code, bank_name, account_number, account_holder, is_qr_enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [nanoid(), memberId, bankBin, bankCode, bankName, accountNumber, accountHolder, isQrEnabled ? 1 : 0, now, now]
    );
  }

  return c.json({ success: true, message: 'Cấu hình tài khoản ngân hàng thành công' });
});
