import { getDb } from '../db/db.js';
import { calculateMemberNetBalances } from '@tinhtien/shared';
import { notificationStatement, broadcastGroupEvent } from '../services/realtime.js';
import { pushToMembers } from '../services/push.js';

export async function handleScheduledReminder(env: { DB: any; GROUP_ROOM: DurableObjectNamespace; VAPID_PUBLIC_KEY?: string; VAPID_PRIVATE_KEY?: string; VAPID_SUBJECT?: string }): Promise<void> {
  const db = getDb(env);

  // Cron chạy mỗi giờ; chỉ xử lý nhóm có lịch nhắc trùng đúng thứ + giờ hiện tại theo giờ Việt Nam (UTC+7)
  const vn = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const dayOfWeek = vn.getUTCDay();
  const hour = vn.getUTCHours();
  const groups = await db.queryAll<{
    id: string;
    name: string;
    public_code: string;
  }>(
    `SELECT g.id, g.name, g.public_code
     FROM groups g
     JOIN group_settings s ON s.group_id = g.id
     WHERE s.is_reminder_enabled = 1 AND s.reminder_day_of_week = ? AND s.reminder_hour = ?`,
    [dayOfWeek, hour]
  );

  for (const group of groups) {
    const members = await db.queryAll<{ id: string; name: string }>(
      `SELECT id, name FROM members WHERE group_id = ?`,
      [group.id]
    );

    const obligations = await db.queryAll<{
      id: string;
      debtor_member_id: string;
      creditor_member_id: string;
      original_amount: number;
      settled_amount: number;
      status: string;
    }>(`SELECT * FROM debt_obligations WHERE group_id = ? AND status = 'ACTIVE'`, [group.id]);

    const mappedObs = obligations.map((ob) => ({
      ...ob,
      debtorMemberId: ob.debtor_member_id,
      creditorMemberId: ob.creditor_member_id,
      remainingAmount: Math.max(0, ob.original_amount - ob.settled_amount),
      status: ob.status as any
    }));

    const netBalances = calculateMemberNetBalances(members, mappedObs);

    // Gộp toàn bộ thông báo của nhóm vào 1 batch + 1 broadcast duy nhất
    const statements = netBalances
      .filter((b) => b.netBalance < 0)
      .map((b) => {
        const debtAmount = Math.abs(b.netBalance);
        return notificationStatement(
          db,
          group.id,
          b.memberId,
          'DEBT_REMINDER',
          'Nhắc nợ định kỳ',
          `Chào ${b.memberName}, bạn hiện đang có khoản nợ ròng ${debtAmount.toLocaleString('vi-VN')}đ trong nhóm "${group.name}". Hãy thanh toán sớm nhé!`,
          { amount: debtAmount }
        );
      });
    if (statements.length === 0) continue;
    await db.batch(statements);
    await broadcastGroupEvent(env, group.id, 'notification.created', group.id, null, { reminder: true });
    await Promise.all(
      netBalances
        .filter((b) => b.netBalance < 0)
        .map((b) =>
          pushToMembers(
            env,
            group.id,
            { memberIds: [b.memberId] },
            {
              title: `⏰ Nhắc nợ: ${group.name}`,
              body: `Bạn đang nợ ròng ${Math.abs(b.netBalance).toLocaleString('vi-VN')}đ. Chạm để xem & trả.`,
              url: `/group/${group.public_code}`,
              tag: `reminder-${group.id}`
            },
            { urgency: 'normal', topic: `reminder${group.id}` }
          )
        )
    );
  }
}
