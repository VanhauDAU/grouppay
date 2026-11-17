import { Hono } from 'hono';
import type { AppEnv } from '../../middleware/groupAuth.js';
import { requireGroup } from '../../middleware/groupAuth.js';
import { getDb } from '../../db/db.js';

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
