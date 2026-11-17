import { getDb } from '../db/db.js';
import { calculateMemberNetBalances } from '@tinhtien/shared';
import { createNotification } from '../services/realtime.js';

export async function handleScheduledReminder(env: { DB: any; GROUP_ROOM: DurableObjectNamespace }): Promise<void> {
  const db = getDb(env);

  // Lấy các nhóm bật tính năng nhắc nợ
  const groups = await db.queryAll<{
    id: string;
    name: string;
  }>(`SELECT g.id, g.name
      FROM groups g
      JOIN group_settings s ON s.group_id = g.id
      WHERE s.is_reminder_enabled = 1`);

  for (const group of groups) {
    const members = await db.queryAll<{ id: string; name: string }>(
      `SELECT id, name FROM members WHERE group_id = ? AND status = 'ACTIVE'`,
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

    for (const b of netBalances) {
      if (b.netBalance < 0) {
        const debtAmount = Math.abs(b.netBalance);
        await createNotification(
          env,
          group.id,
          b.memberId,
          'DEBT_REMINDER',
          'Nhắc nợ định kỳ',
          `Chào ${b.memberName}, bạn hiện đang có khoản nợ ròng ${debtAmount.toLocaleString('vi-VN')}đ trong nhóm "${group.name}". Hãy thanh toán sớm nhé!`,
          { amount: debtAmount }
        );
      }
    }
  }
}
