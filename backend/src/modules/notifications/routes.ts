import { Hono } from 'hono';
import type { AppEnv } from '../../middleware/groupAuth.js';
import { requireGroup } from '../../middleware/groupAuth.js';
import { getDb } from '../../db/db.js';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { getVapid, pushToMembers } from '../../services/push.js';

export const notificationsRouter = new Hono<AppEnv>();

notificationsRouter.get('/:groupCode/notifications', requireGroup, async (c) => {
  const group = c.get('group');
  const currentMember = c.get('currentMember');
  const db = getDb(c.env);

  let sql = `
    SELECT * FROM notifications
    WHERE group_id = ? AND (target_member_id IS NULL
  `;
  const params: any[] = [group.id];

  if (currentMember) {
    sql += ` OR target_member_id = ?)`;
    params.push(currentMember.id);
  } else {
    sql += `)`;
  }

  sql += ` ORDER BY created_at DESC LIMIT 50`;

  const notifications = await db.queryAll<{
    id: string;
    group_id: string;
    target_member_id: string | null;
    type: string;
    title: string;
    message: string;
    data: string | null;
    is_read: number;
    created_at: string;
  }>(sql, params);

  const formatted = notifications.map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    message: n.message,
    data: n.data ? JSON.parse(n.data) : null,
    isRead: Boolean(n.is_read),
    createdAt: n.created_at
  }));

  return c.json({ success: true, data: formatted });
});

notificationsRouter.post('/:groupCode/notifications/read-all', requireGroup, async (c) => {
  const group = c.get('group');
  const currentMember = c.get('currentMember');
  const db = getDb(c.env);

  if (currentMember) {
    await db.execute(
      `UPDATE notifications SET is_read = 1 WHERE group_id = ? AND (target_member_id = ? OR target_member_id IS NULL)`,
      [group.id, currentMember.id]
    );
  } else {
    await db.execute(`UPDATE notifications SET is_read = 1 WHERE group_id = ?`, [group.id]);
  }

  return c.json({ success: true, message: 'Đã đánh dấu đọc tất cả thông báo' });
});

// ---------- Web Push ----------

const SubscribeSchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(20).max(200), auth: z.string().min(8).max(100) })
});

// Khóa công khai VAPID để trình duyệt đăng ký nhận push
notificationsRouter.get('/:groupCode/push/public-key', requireGroup, (c) => {
  const vapid = getVapid(c.env);
  return c.json({ success: true, data: { publicKey: vapid?.publicKey || null } });
});

// Đăng ký / cập nhật thiết bị nhận thông báo cho thành viên hiện tại (upsert theo endpoint)
notificationsRouter.post('/:groupCode/push/subscribe', requireGroup, async (c) => {
  const group = c.get('group');
  const currentMember = c.get('currentMember');
  if (!currentMember) {
    return c.json({ success: false, error: 'Vui lòng chọn tên của bạn trước khi bật thông báo' }, 400);
  }
  const parsed = SubscribeSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ success: false, error: 'Dữ liệu đăng ký thông báo không hợp lệ' }, 400);
  }
  const { endpoint, keys } = parsed.data;
  const now = new Date().toISOString();
  const db = getDb(c.env);
  await db.execute(
    `INSERT INTO push_subscriptions (id, group_id, member_id, endpoint, p256dh, auth, user_agent, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(group_id, endpoint) DO UPDATE SET
       member_id = excluded.member_id, p256dh = excluded.p256dh, auth = excluded.auth,
       user_agent = excluded.user_agent, updated_at = excluded.updated_at`,
    [nanoid(), group.id, currentMember.id, endpoint, keys.p256dh, keys.auth, (c.req.header('User-Agent') || '').slice(0, 200), now, now]
  );
  return c.json({ success: true });
});

notificationsRouter.post('/:groupCode/push/unsubscribe', requireGroup, async (c) => {
  const group = c.get('group');
  const body = await c.req.json().catch(() => ({}));
  if (typeof body?.endpoint === 'string') {
    await getDb(c.env).execute(`DELETE FROM push_subscriptions WHERE group_id = ? AND endpoint = ?`, [group.id, body.endpoint]);
  }
  return c.json({ success: true });
});

// Gửi thử 1 thông báo đẩy tới chính thiết bị của mình (kiểm tra cấu hình end-to-end)
notificationsRouter.post('/:groupCode/push/test', requireGroup, async (c) => {
  const group = c.get('group');
  const currentMember = c.get('currentMember');
  if (!currentMember) return c.json({ success: false, error: 'Chưa chọn thành viên' }, 400);
  if (!getVapid(c.env)) return c.json({ success: false, error: 'Máy chủ chưa cấu hình khóa VAPID' }, 503);
  await pushToMembers(
    c.env,
    group.id,
    { memberIds: [currentMember.id] },
    { title: '🔔 Sổ Nợ Nghĩa Tình', body: 'Thông báo đẩy hoạt động tốt trên thiết bị này!', url: `/group/${group.publicCode}`, tag: 'test' }
  );
  return c.json({ success: true });
});
