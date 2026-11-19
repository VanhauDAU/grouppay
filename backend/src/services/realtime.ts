import { nanoid } from 'nanoid';
import type { RealtimeEventType, RealtimeMessage } from '@tinhtien/shared';
import { getDb, type DatabaseHelper } from '../db/db.js';

/**
 * Broadcast 1 sự kiện tới room của nhóm.
 * Tối ưu chi phí: chỉ 1 request tới Durable Object, không truy vấn D1
 * (WebSocket endpoint luôn map client vào room theo group.id nên không cần room theo public_code nữa).
 * Mỗi thao tác chỉ nên gọi hàm này 1 lần — client tự đồng bộ lại toàn bộ (gồm cả thông báo) qua /sync.
 */
export async function broadcastGroupEvent(
  env: { GROUP_ROOM: DurableObjectNamespace },
  groupId: string,
  eventType: RealtimeEventType,
  entityId: string,
  actorMemberId?: string | null,
  payload?: any
): Promise<void> {
  const event: RealtimeMessage = {
    eventId: nanoid(16),
    groupId,
    eventType,
    entityId,
    actorMemberId,
    timestamp: new Date().toISOString(),
    payload
  };

  try {
    const roomStub = env.GROUP_ROOM.get(env.GROUP_ROOM.idFromName(groupId));
    await roomStub.fetch('http://internal/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event)
    });
  } catch (err) {
    // Durable Object broadcast lỗi không chặn luồng chính
    console.error('Failed to broadcast DO event:', err);
  }
}

/** Câu lệnh ghi audit log để gộp vào db.batch() của thao tác chính (bớt 1 round-trip D1). */
export function auditStatement(
  db: DatabaseHelper,
  groupId: string,
  actorMemberId: string | null | undefined,
  action: string,
  entityType: string,
  entityId: string,
  metadata?: any
) {
  return db.prepare(
    `INSERT INTO audit_logs (id, group_id, actor_member_id, action, entity_type, entity_id, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      nanoid(),
      groupId,
      actorMemberId || null,
      action,
      entityType,
      entityId,
      metadata ? JSON.stringify(metadata) : null,
      new Date().toISOString()
    ]
  );
}

/** Câu lệnh tạo thông báo để gộp vào db.batch() của thao tác chính. */
export function notificationStatement(
  db: DatabaseHelper,
  groupId: string,
  targetMemberId: string | null,
  type: string,
  title: string,
  message: string,
  data?: any
) {
  return db.prepare(
    `INSERT INTO notifications (id, group_id, target_member_id, type, title, message, data, is_read, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    [
      nanoid(),
      groupId,
      targetMemberId || null,
      type,
      title,
      message,
      data ? JSON.stringify(data) : null,
      new Date().toISOString()
    ]
  );
}

export async function logAudit(
  env: { DB: any },
  groupId: string,
  actorMemberId: string | null | undefined,
  action: string,
  entityType: string,
  entityId: string,
  metadata?: any
): Promise<void> {
  const db = getDb(env);
  await auditStatement(db, groupId, actorMemberId, action, entityType, entityId, metadata).run();
}

/**
 * Tạo thông báo. Mặc định KHÔNG broadcast riêng (sự kiện chính của thao tác đã kích hoạt client đồng bộ),
 * tránh nhân đôi request Durable Object + request /sync trên mọi thiết bị.
 */
export async function createNotification(
  env: { DB: any; GROUP_ROOM: DurableObjectNamespace },
  groupId: string,
  targetMemberId: string | null,
  type: string,
  title: string,
  message: string,
  data?: any,
  options: { broadcast?: boolean } = {}
): Promise<void> {
  const db = getDb(env);
  await notificationStatement(db, groupId, targetMemberId, type, title, message, data).run();

  if (options.broadcast) {
    await broadcastGroupEvent(env, groupId, 'notification.created', groupId, null, { title, targetMemberId });
  }
}
