import { calculateMemberNetBalances, calculatePairwiseDebts, optimizeSettlements } from '@tinhtien/shared';
import type { DatabaseHelper } from '../db/db.js';

/**
 * Ảnh chụp tài chính của nhóm, dùng chung cho /sync, /dashboard, /debts để 3 nơi luôn ra cùng một con số.
 */

export async function loadMembersWithBank(db: DatabaseHelper, groupId: string) {
  return db.queryAll<any>(
    `SELECT m.id, m.name, m.avatar_url as avatarUrl, m.status, m.created_at,
            b.bank_bin as bankBin, b.bank_code as bankCode, b.bank_name as bankName,
            b.account_number as accountNumber, b.account_holder as accountHolder,
            b.is_qr_enabled as isQrEnabled
     FROM members m
     LEFT JOIN bank_accounts b ON b.member_id = m.id
     WHERE m.group_id = ?
     ORDER BY m.created_at ASC`,
    [groupId]
  );
}

export async function loadMappedObligations(db: DatabaseHelper, groupId: string) {
  const rows = await db.queryAll<any>(
    `SELECT ob.*,
            m1.name as debtor_name,
            m2.name as creditor_name,
            a.title as activity_title,
            a.occurred_at as activity_occurred_at
     FROM debt_obligations ob
     JOIN members m1 ON m1.id = ob.debtor_member_id
     JOIN members m2 ON m2.id = ob.creditor_member_id
     LEFT JOIN activities a ON a.id = ob.source_id AND ob.source_type IN ('EXPENSE', 'ADJUSTMENT')
     WHERE ob.group_id = ? AND ob.status != 'CANCELLED'
     ORDER BY ob.created_at DESC`,
    [groupId]
  );

  return rows.map((ob: any) => ({
    ...ob,
    debtorMemberId: ob.debtor_member_id,
    creditorMemberId: ob.creditor_member_id,
    debtorName: ob.debtor_name,
    creditorName: ob.creditor_name,
    originalAmount: ob.original_amount,
    settledAmount: ob.settled_amount,
    remainingAmount: Math.max(0, ob.original_amount - ob.settled_amount),
    sourceType: ob.source_type,
    sourceId: ob.source_id,
    activityTitle: obligationTitle(ob),
    activityOccurredAt: ob.activity_occurred_at || ob.created_at,
    createdAt: ob.created_at,
    updatedAt: ob.updated_at
  }));
}

function obligationTitle(ob: any): string {
  if (ob.source_type === 'INITIAL_DEBT') return 'Công nợ ban đầu';
  if (ob.source_type === 'ADJUSTMENT') {
    return ob.activity_title ? `Hoàn tiền điều chỉnh: ${ob.activity_title}` : 'Hoàn tiền chuyển dư';
  }
  return ob.activity_title || 'Khoản chi';
}

/** Tổng chi tiêu của các hoạt động còn hiệu lực (không tính hoạt động đã hủy). */
export async function loadTotalExpense(db: DatabaseHelper, groupId: string) {
  const row = await db.queryFirst<{ total: number }>(
    `SELECT COALESCE(SUM(e.amount), 0) as total
     FROM expenses e
     JOIN activities a ON a.id = e.activity_id
     WHERE e.group_id = ? AND a.status = 'ACTIVE'`,
    [groupId]
  );
  return row?.total || 0;
}

export function computeBalances(members: { id: string; name: string; avatarUrl?: string | null }[], obligations: any[]) {
  const netBalances = calculateMemberNetBalances(members, obligations).map((b) => ({
    ...b,
    avatarUrl: members.find((m) => m.id === b.memberId)?.avatarUrl || null
  }));
  const pairwiseDebts = calculatePairwiseDebts(members, obligations);
  const settlementProposals = optimizeSettlements(netBalances);
  return { netBalances, pairwiseDebts, settlementProposals };
}

export function buildPersonal(
  member: { id: string; name: string },
  members: any[],
  balances: ReturnType<typeof computeBalances>,
  payments: any[]
) {
  const { netBalances, pairwiseDebts } = balances;
  const myBalance = netBalances.find((b) => b.memberId === member.id);
  const byId = new Map(members.map((m: any) => [m.id, m]));

  const peopleIOwe = pairwiseDebts
    .filter((p) => p.netDebtorId === member.id)
    .map((p) => {
      const creditor = byId.get(p.netCreditorId);
      return {
        creditorId: p.netCreditorId,
        creditorName: p.netCreditorId === p.memberAId ? p.memberAName : p.memberBName,
        avatarUrl: creditor?.avatarUrl || null,
        amount: p.netAmount,
        bankAccount: creditor?.accountNumber
          ? {
              bankBin: creditor.bankBin,
              bankCode: creditor.bankCode,
              bankName: creditor.bankName,
              accountNumber: creditor.accountNumber,
              accountHolder: creditor.accountHolder,
              isQrEnabled: Boolean(creditor.isQrEnabled)
            }
          : null
      };
    });

  const peopleOweMe = pairwiseDebts
    .filter((p) => p.netCreditorId === member.id)
    .map((p) => ({
      debtorId: p.netDebtorId,
      debtorName: p.netDebtorId === p.memberAId ? p.memberAName : p.memberBName,
      avatarUrl: byId.get(p.netDebtorId)?.avatarUrl || null,
      amount: p.netAmount
    }));

  const pending = payments.filter((p) => p.status === 'PENDING_CONFIRMATION');

  return {
    memberId: member.id,
    memberName: member.name,
    avatarUrl: byId.get(member.id)?.avatarUrl || null,
    totalOwedToOthers: myBalance?.totalOwedToOthers || 0,
    totalOwedByOthers: myBalance?.totalOwedByOthers || 0,
    netBalance: myBalance?.netBalance || 0,
    peopleIOwe,
    peopleOweMe,
    pendingReceived: pending.filter((p) => p.recipient_member_id === member.id),
    pendingSent: pending.filter((p) => p.payer_member_id === member.id)
  };
}

/** Danh sách thanh toán kèm người nhận trong 1 truy vấn (thay cho N+1 truy vấn allocations). */
export async function listPaymentsWithRecipient(db: DatabaseHelper, groupId: string, limit = 200) {
  const rows = await db.queryAll<any>(
    `SELECT p.id, p.group_id, p.payer_member_id, p.total_amount, p.status, p.rejection_reason,
            p.proof_image_url, p.created_at, p.updated_at,
            payer.name AS payer_name,
            pa.recipient_member_id, rec.name AS recipient_name
     FROM payments p
     JOIN members payer ON payer.id = p.payer_member_id
     LEFT JOIN payment_allocations pa ON pa.id = (
       SELECT pa2.id FROM payment_allocations pa2 WHERE pa2.payment_id = p.id LIMIT 1
     )
     LEFT JOIN members rec ON rec.id = pa.recipient_member_id
     WHERE p.group_id = ?
     ORDER BY p.created_at DESC
     LIMIT ?`,
    [groupId, limit]
  );
  // Giữ tương thích frontend cũ: mảng allocations (mỗi payment 1 người nhận)
  return rows.map((p) => ({
    ...p,
    allocations: p.recipient_member_id
      ? [
          {
            recipient_member_id: p.recipient_member_id,
            recipient_name: p.recipient_name,
            amount: p.total_amount,
            status: p.status
          }
        ]
      : []
  }));
}
