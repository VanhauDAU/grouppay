import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { CreateGroupSchema, UpdateGroupSchema, UpdateGroupSettingsSchema } from '@tinhtien/shared';
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
