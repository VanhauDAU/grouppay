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
    const doId = env.GROUP_ROOM.idFromName(groupId);
    const roomStub = env.GROUP_ROOM.get(doId);
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
