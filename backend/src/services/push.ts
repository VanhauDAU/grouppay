import { getDb } from '../db/db.js';
import { sendWebPush, type PushMessage, type VapidConfig } from './webpush.js';

export interface PushEnv {
  DB: any;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
}

export function getVapid(env: PushEnv): VapidConfig | null {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return null;
  return {
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
    subject: env.VAPID_SUBJECT || 'https://sononghiatinh.pages.dev'
  };
}

/**
 * Gửi thông báo đẩy tới thiết bị của các thành viên trong nhóm.
 *  - memberIds: chỉ gửi cho những người này (null = cả nhóm)
 *  - excludeMemberId: không gửi cho người vừa thao tác
 * Thiết bị đã gỡ quyền (404/410) được tự xóa để lần sau không tốn request.
 * Nên gọi qua executionCtx.waitUntil() để không làm chậm phản hồi API.
 */
export async function pushToMembers(
  env: PushEnv,
  groupId: string,
  target: { memberIds?: string[] | null; excludeMemberId?: string | null },
  message: PushMessage,
  options: { urgency?: 'normal' | 'high'; topic?: string; ttl?: number } = {}
): Promise<void> {
  const vapid = getVapid(env);
  if (!vapid) return;
  const db = getDb(env);

  let sql = `SELECT id, member_id, endpoint, p256dh, auth FROM push_subscriptions WHERE group_id = ?`;
  const params: any[] = [groupId];
  if (target.memberIds && target.memberIds.length > 0) {
    sql += ` AND member_id IN (${target.memberIds.map(() => '?').join(',')})`;
    params.push(...target.memberIds);
  } else if (target.memberIds) {
    return; // danh sách rỗng
  }
  if (target.excludeMemberId) {
    sql += ` AND member_id != ?`;
    params.push(target.excludeMemberId);
  }

  const subs = await db.queryAll<{ id: string; member_id: string; endpoint: string; p256dh: string; auth: string }>(
    sql,
    params
  );
  if (subs.length === 0) return;

  const results = await Promise.all(subs.map((s) => sendWebPush(s, message, vapid, options)));
  const gone = subs.filter((_, i) => results[i].gone).map((s) => s.id);
  if (gone.length > 0) {
    await db.execute(`DELETE FROM push_subscriptions WHERE id IN (${gone.map(() => '?').join(',')})`, gone);
  }
}
