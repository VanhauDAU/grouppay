import { Hono } from 'hono';
import { calculateMemberNetBalances, calculatePairwiseDebts, optimizeSettlements } from '@tinhtien/shared';
import type { AppEnv } from '../../middleware/groupAuth.js';
import { requireGroup } from '../../middleware/groupAuth.js';
import { getDb } from '../../db/db.js';

export const dashboardRouter = new Hono<AppEnv>();

dashboardRouter.get('/:groupCode/dashboard', requireGroup, async (c) => {
  const group = c.get('group');
  const currentMember = c.get('currentMember');
  const db = getDb(c.env);

  // 1. Danh sách thành viên kèm ngân hàng
  const members = await db.queryAll<{
    id: string;
    name: string;
    avatar_url: string | null;
    status: string;
    bank_bin: string | null;
    bank_code: string | null;
    bank_name: string | null;
    account_number: string | null;
    account_holder: string | null;
    is_qr_enabled: number | null;
  }>(
    `SELECT m.id, m.name, m.avatar_url, m.status,
            b.bank_bin, b.bank_code, b.bank_name, b.account_number, b.account_holder, b.is_qr_enabled
     FROM members m
     LEFT JOIN bank_accounts b ON b.member_id = m.id
     WHERE m.group_id = ?
     ORDER BY m.created_at ASC`,
    [group.id]
  );

  // 2. Nghĩa vụ nợ gốc còn hiệu lực
  const obligations = await db.queryAll<{
    id: string;
    group_id: string;
    source_type: string;
    source_id: string;
    debtor_member_id: string;
    creditor_member_id: string;
    original_amount: number;
    settled_amount: number;
    status: 'ACTIVE' | 'FULLY_SETTLED';
    created_at: string;
    updated_at: string;
  }>(
    `SELECT * FROM debt_obligations
     WHERE group_id = ? AND status != 'CANCELLED'`,
    [group.id]
  );

  const mappedObs = obligations.map((ob) => ({
    ...ob,
    debtorMemberId: ob.debtor_member_id,
    creditorMemberId: ob.creditor_member_id,
    remainingAmount: Math.max(0, ob.original_amount - ob.settled_amount)
  }));

  // 3. Tính toán Net Balances & Pairwise
  const netBalances = calculateMemberNetBalances(members, mappedObs as any);
  const pairwiseDebts = calculatePairwiseDebts(members, mappedObs as any);
  const settlementProposals = optimizeSettlements(netBalances);

  // 4. Tổng chi tiêu nhóm
  const totalExpenseResult = await db.queryFirst<{ total: number }>(
    `SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE group_id = ?`,
    [group.id]
  );
  const totalExpense = totalExpenseResult?.total || 0;

  // 5. Các giao dịch đang chờ xác nhận
  const pendingPayments = await db.queryAll<{
    id: string;
    payer_member_id: string;
    total_amount: number;
    created_at: string;
    payer_name: string;
    recipient_member_id: string;
    recipient_name: string;
  }>(
    `SELECT p.id, p.payer_member_id, p.total_amount, p.created_at,
            m1.name as payer_name,
            pa.recipient_member_id,
            m2.name as recipient_name
     FROM payments p
     JOIN members m1 ON m1.id = p.payer_member_id
     JOIN payment_allocations pa ON pa.payment_id = p.id
     JOIN members m2 ON m2.id = pa.recipient_member_id
     WHERE p.group_id = ? AND p.status = 'PENDING_CONFIRMATION'
     ORDER BY p.created_at DESC`,
    [group.id]
  );

  // 6. Hoạt động gần đây
  const recentActivities = await db.queryAll<{
    id: string;
    title: string;
    occurred_at: string;
    total_amount: number;
    expense_count: number;
  }>(
    `SELECT a.id, a.title, a.occurred_at,
            COALESCE(SUM(e.amount), 0) as total_amount,
            COUNT(e.id) as expense_count
     FROM activities a
     LEFT JOIN expenses e ON e.activity_id = a.id
     WHERE a.group_id = ? AND a.status = 'ACTIVE'
     GROUP BY a.id
     ORDER BY a.occurred_at DESC
     LIMIT 5`,
    [group.id]
  );

  // 7. Chi tiết cá nhân (nếu đã chọn member)
  let personal = null;
  if (currentMember) {
    const myBalance = netBalances.find((b) => b.memberId === currentMember.id);
    const peopleIOwe = pairwiseDebts
      .filter((p) => p.netDebtorId === currentMember.id)
      .map((p) => {
        const creditorMember = members.find((m) => m.id === p.netCreditorId);
        return {
          creditorId: p.netCreditorId,
          creditorName: p.netCreditorId === p.memberAId ? p.memberAName : p.memberBName,
          avatarUrl: creditorMember?.avatar_url || null,
          amount: p.netAmount,
          bankAccount: creditorMember?.account_number
            ? {
                bankBin: creditorMember.bank_bin,
                bankCode: creditorMember.bank_code,
                bankName: creditorMember.bank_name,
                accountNumber: creditorMember.account_number,
                accountHolder: creditorMember.account_holder,
                isQrEnabled: Boolean(creditorMember.is_qr_enabled)
              }
            : null
        };
      });

    const peopleOweMe = pairwiseDebts
      .filter((p) => p.netCreditorId === currentMember.id)
      .map((p) => {
        const debtorMember = members.find((m) => m.id === p.netDebtorId);
        return {
          debtorId: p.netDebtorId,
          debtorName: p.netDebtorId === p.memberAId ? p.memberAName : p.memberBName,
          avatarUrl: debtorMember?.avatar_url || null,
          amount: p.netAmount
        };
      });

    const myPendingReceived = pendingPayments.filter((p) => p.recipient_member_id === currentMember.id);
    const myPendingSent = pendingPayments.filter((p) => p.payer_member_id === currentMember.id);

    const currentMemberRecord = members.find((m) => m.id === currentMember.id);

    personal = {
      memberId: currentMember.id,
      memberName: currentMember.name,
      avatarUrl: currentMemberRecord?.avatar_url || null,
      totalOwedToOthers: myBalance?.totalOwedToOthers || 0,
      totalOwedByOthers: myBalance?.totalOwedByOthers || 0,
      netBalance: myBalance?.netBalance || 0,
      peopleIOwe,
      peopleOweMe,
      pendingReceived: myPendingReceived,
      pendingSent: myPendingSent
    };
  }

  const netBalancesWithAvatar = netBalances.map((b) => {
    const mem = members.find((m) => m.id === b.memberId);
    return {
      ...b,
      avatarUrl: mem?.avatar_url || null
    };
  });

  return c.json({
    success: true,
    data: {
      group: {
        id: group.id,
        name: group.name,
        currency: group.currency,
        totalExpense,
        memberBalances: netBalancesWithAvatar
      },
      personal,
      netBalances: netBalancesWithAvatar,
      pairwiseDebts,
      settlementProposals,
      pendingPayments,
      recentActivities
    }
  });
});
