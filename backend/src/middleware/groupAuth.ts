import type { MiddlewareHandler } from 'hono';
import { getDb } from '../db/db.js';

export interface AppEnv {
  Bindings: {
    DB: any;
    GROUP_ROOM: DurableObjectNamespace;
    ENVIRONMENT?: string;
  };
  Variables: {
    group: {
      id: string;
      publicCode: string;
      name: string;
      accessToken: string;
      currency: string;
    };
    currentMember?: {
      id: string;
      groupId: string;
      name: string;
      status: string;
    };
  };
}

/**
 * Middleware kiểm tra và nạp thông tin nhóm từ publicCode hoặc ID.
 */
export const requireGroup: MiddlewareHandler<AppEnv> = async (c, next) => {
  const groupCode =
    c.req.param('groupCode') ||
    c.req.param('id') ||
    c.req.header('X-Group-Code') ||
    c.req.query('groupCode');

  if (!groupCode) {
    return c.json({ success: false, error: 'Thiếu mã định danh nhóm' }, 400);
  }

  const db = getDb(c.env);
  const group = await db.queryFirst<{
    id: string;
    public_code: string;
    name: string;
    access_token: string;
    currency: string;
  }>(
    `SELECT id, public_code, name, access_token, currency FROM groups WHERE public_code = ? OR id = ?`,
    [groupCode, groupCode]
  );

  if (!group) {
    return c.json({ success: false, error: 'Không tìm thấy nhóm hoặc link không hợp lệ' }, 404);
  }

  c.set('group', {
    id: group.id,
    publicCode: group.public_code,
    name: group.name,
    accessToken: group.access_token,
    currency: group.currency
  });

  // Kiểm tra member session nếu có header X-Member-Id hoặc Bearer token
  const memberIdHeader = c.req.header('X-Member-Id');
  if (memberIdHeader) {
    const member = await db.queryFirst<{
      id: string;
      group_id: string;
      name: string;
      status: string;
    }>(`SELECT id, group_id, name, status FROM members WHERE id = ? AND group_id = ?`, [
      memberIdHeader,
      group.id
    ]);

    if (member) {
      c.set('currentMember', {
        id: member.id,
        groupId: member.group_id,
        name: member.name,
        status: member.status
      });
    }
  }

  await next();
};
