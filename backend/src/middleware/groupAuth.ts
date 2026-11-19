import type { MiddlewareHandler } from 'hono';
import { getDb } from '../db/db.js';
import { normalizeGroupCodeInput } from '@tinhtien/shared';

export interface AppEnv {
  Bindings: {
    DB: any;
    GROUP_ROOM: DurableObjectNamespace;
    ENVIRONMENT?: string;
    VAPID_PUBLIC_KEY?: string;
    VAPID_PRIVATE_KEY?: string;
    VAPID_SUBJECT?: string;
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

type GroupRow = { id: string; public_code: string; name: string; access_token: string; currency: string };

/**
 * Cache nhóm trong bộ nhớ isolate (id/public_code bất biến, tên nhóm hiếm khi đổi).
 * Mỗi request API bớt được 1 lượt đọc D1; WebSocket connect cũng dùng chung.
 */
const GROUP_CACHE_TTL_MS = 60_000;
const groupCache = new Map<string, { row: GroupRow; expiresAt: number }>();

export async function resolveGroup(env: { DB: any }, groupCode: string): Promise<GroupRow | null> {
  const cached = groupCache.get(groupCode);
  if (cached && cached.expiresAt > Date.now()) return cached.row;

  // Chấp nhận "k7mq-4xpz", "K7MQ 4XPZ"... với mã kiểu mới; mã cũ vẫn tra đúng nguyên văn
  const normalized = normalizeGroupCodeInput(groupCode);
  const row = await getDb(env).queryFirst<GroupRow>(
    `SELECT id, public_code, name, access_token, currency FROM groups WHERE public_code = ? OR public_code = ? OR id = ? LIMIT 1`,
    [normalized, groupCode, groupCode]
  );
  if (row) {
    if (groupCache.size > 500) groupCache.clear();
    const entry = { row, expiresAt: Date.now() + GROUP_CACHE_TTL_MS };
    groupCache.set(row.id, entry);
    groupCache.set(row.public_code, entry);
    groupCache.set(groupCode, entry);
  }
  return row;
}

export function invalidateGroupCache(groupId: string, _publicCode?: string) {
  // Xóa mọi khóa trỏ tới nhóm này (kể cả cách gõ khác như chữ thường / có gạch)
  for (const [key, entry] of groupCache) {
    if (entry.row.id === groupId) groupCache.delete(key);
  }
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
  const group = await resolveGroup(c.env, groupCode);

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
