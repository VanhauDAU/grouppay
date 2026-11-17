import { Hono } from 'hono';
import type { AppEnv } from '../../middleware/groupAuth.js';
import { requireGroup } from '../../middleware/groupAuth.js';
import { getDb } from '../../db/db.js';

export const historyRouter = new Hono<AppEnv>();

historyRouter.get('/:groupCode/history', requireGroup, async (c) => {
  const group = c.get('group');
  const db = getDb(c.env);

  const fromDate = c.req.query('fromDate');
  const toDate = c.req.query('toDate');
  const memberId = c.req.query('memberId');
  const q = c.req.query('q');

  let sql = `
    SELECT al.id, al.group_id, al.actor_member_id, al.action, al.entity_type, al.entity_id,
           al.metadata, al.created_at, m.name as actor_name
    FROM audit_logs al
    LEFT JOIN members m ON m.id = al.actor_member_id
    WHERE al.group_id = ?
  `;
  const params: any[] = [group.id];

  if (fromDate) {
    sql += ` AND al.created_at >= ?`;
    params.push(fromDate);
  }
  if (toDate) {
    sql += ` AND al.created_at <= ?`;
    params.push(toDate);
  }
  if (memberId) {
    sql += ` AND al.actor_member_id = ?`;
    params.push(memberId);
  }
  if (q && q.trim()) {
    sql += ` AND (al.action LIKE ? OR al.metadata LIKE ?)`;
    params.push(`%${q.trim()}%`, `%${q.trim()}%`);
  }

  sql += ` ORDER BY al.created_at DESC LIMIT 100`;

  const logs = await db.queryAll<{
    id: string;
    group_id: string;
    actor_member_id: string | null;
    action: string;
    entity_type: string;
    entity_id: string;
    metadata: string | null;
    created_at: string;
    actor_name: string | null;
  }>(sql, params);

  const formatted = logs.map((log) => ({
    id: log.id,
    action: log.action,
    entityType: log.entity_type,
    entityId: log.entity_id,
    actorName: log.actor_name || 'Hệ thống',
    metadata: log.metadata ? JSON.parse(log.metadata) : null,
    createdAt: log.created_at
  }));

  return c.json({ success: true, data: formatted });
});
