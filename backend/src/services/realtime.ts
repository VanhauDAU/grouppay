import { nanoid } from 'nanoid';
import type { RealtimeEventType, RealtimeMessage } from '@tinhtien/shared';
import { getDb } from '../db/db.js';

export async function broadcastGroupEvent(
  env: { GROUP_ROOM: DurableObjectNamespace; DB: any },
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
    // 1. Luôn broadcast tới room bằng groupId (UUID nội bộ)
    const doId = env.GROUP_ROOM.idFromName(groupId);
    const roomStub = env.GROUP_ROOM.get(doId);
    const p1 = roomStub.fetch('http://internal/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event)
    });

    // 2. Broadcast đồng thời tới cả room bằng public_code nếu có DB
    // Đảm bảo client kết nối bằng public_code hay groupId đều nhận tức thì!
    let p2: Promise<any> | null = null;
    if (env.DB) {
      try {
        const db = getDb(env);
        const group = await db.queryFirst<{ id: string; public_code: string }>(
          'SELECT id, public_code FROM groups WHERE id = ? OR public_code = ? LIMIT 1',
          [groupId, groupId]
        );
        if (group?.public_code && group.public_code !== groupId) {
          const doIdCode = env.GROUP_ROOM.idFromName(group.public_code);
          const roomStubCode = env.GROUP_ROOM.get(doIdCode);
          p2 = roomStubCode.fetch('http://internal/broadcast', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(event)
          });
        }
      } catch {
        // ignore
      }
    }

    await Promise.allSettled([p1, p2].filter(Boolean) as Promise<any>[]);
  } catch (err) {
    // Durable Object broadcast lỗi không chặn luồng chính
    console.error('Failed to broadcast DO event:', err);
  }
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
  const now = new Date().toISOString();
  await db.execute(
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
      now
    ]
  );
}

export async function createNotification(
  env: { DB: any; GROUP_ROOM: DurableObjectNamespace },
  groupId: string,
  targetMemberId: string | null,
  type: string,
  title: string,
  message: string,
  data?: any
): Promise<void> {
  const db = getDb(env);
  const notifId = nanoid();
  const now = new Date().toISOString();

  await db.execute(
    `INSERT INTO notifications (id, group_id, target_member_id, type, title, message, data, is_read, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    [notifId, groupId, targetMemberId || null, type, title, message, data ? JSON.stringify(data) : null, now]
  );

  await broadcastGroupEvent(env, groupId, 'notification.created', notifId, null, {
    title,
    message,
    targetMemberId
  });
}
