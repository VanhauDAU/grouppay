/**
 * Business Rules for Debt Calculation & Net Balance (BR-10, BR-14, BR-15, BR-18)
 * Quản lý tính công nợ gốc minh bạch và tổng hợp số dư ròng không làm mất dữ liệu gốc.
 */

import type { DebtObligation, MemberNetBalance, PairwiseDebt } from '../types/index.js';

export interface PayerShare {
  memberId: string;
  amountPaid: number;
}

export interface ParticipantShare {
  memberId: string;
  amountOwed: number;
}

export interface GeneratedObligation {
  debtorMemberId: string;
  creditorMemberId: string;
  amount: number;
}

/**
 * Sinh danh sách nghĩa vụ nợ gốc từ một khoản chi (hỗ trợ nhiều người trả và nhiều người chịu).
 * Sử dụng giải thuật ghép cặp số dư ròng nguyên số (integer greedy matching)
 * đảm bảo tổng nợ sinh ra bằng đúng chênh lệch tài chính, không phát sinh số lẻ thập phân.
 */
export function generateObligationsFromExpense(
  payers: PayerShare[],
  participants: ParticipantShare[]
): GeneratedObligation[] {
  const balanceMap = new Map<string, number>();

  // Cộng tiền người thanh toán đã bỏ ra
  for (const p of payers) {
    balanceMap.set(p.memberId, (balanceMap.get(p.memberId) || 0) + p.amountPaid);
  }

  // Trừ tiền người tham gia phải chịu chi phí
  for (const s of participants) {
    balanceMap.set(s.memberId, (balanceMap.get(s.memberId) || 0) - s.amountOwed);
  }

  const creditors: { memberId: string; amount: number }[] = [];
  const debtors: { memberId: string; amount: number }[] = [];

  for (const [memberId, balance] of balanceMap.entries()) {
    if (balance > 0) {
      creditors.push({ memberId, amount: balance });
    } else if (balance < 0) {
      debtors.push({ memberId, amount: -balance });
    }
  }

  // Sắp xếp ổn định theo ID để đảm bảo tính nhất quán (deterministic)
  creditors.sort((a, b) => a.memberId.localeCompare(b.memberId));
  debtors.sort((a, b) => a.memberId.localeCompare(b.memberId));

  const obligations: GeneratedObligation[] = [];
  let cIdx = 0;
  let dIdx = 0;

  while (cIdx < creditors.length && dIdx < debtors.length) {
    const creditor = creditors[cIdx];
    const debtor = debtors[dIdx];

    const settleAmount = Math.min(creditor.amount, debtor.amount);
    if (settleAmount > 0) {
      obligations.push({
        debtorMemberId: debtor.memberId,
        creditorMemberId: creditor.memberId,
        amount: settleAmount
      });

      creditor.amount -= settleAmount;
      debtor.amount -= settleAmount;
    }

    if (creditor.amount === 0) cIdx++;
    if (debtor.amount === 0) dIdx++;
  }

  return obligations;
}

/**
 * Tính toán công nợ hai chiều giữa từng cặp thành viên (Pairwise Debts).
 * Giữ nguyên các khoản nợ gốc thực tế và tính bù trừ ròng.
 */
export function calculatePairwiseDebts(
  members: { id: string; name: string }[],
  obligations: Pick<DebtObligation, 'debtorMemberId' | 'creditorMemberId' | 'remainingAmount' | 'status'>[]
): PairwiseDebt[] {
  const memberMap = new Map(members.map((m) => [m.id, m.name]));

  // Ma trận nợ chưa thanh toán: matrix[from][to] = amount
  const debtMatrix = new Map<string, Map<string, number>>();

  for (const m of members) {
    debtMatrix.set(m.id, new Map());
  }

  for (const ob of obligations) {
    if (ob.status === 'CANCELLED') continue;
    const remaining = ob.remainingAmount;
    if (remaining <= 0) continue;

    const fromMap = debtMatrix.get(ob.debtorMemberId);
    if (fromMap) {
      fromMap.set(ob.creditorMemberId, (fromMap.get(ob.creditorMemberId) || 0) + remaining);
    }
  }

  const pairwiseResults: PairwiseDebt[] = [];
  const processedPairs = new Set<string>();

  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const a = members[i];
      const b = members[j];
      const pairKey = [a.id, b.id].sort().join(':');
      if (processedPairs.has(pairKey)) continue;
      processedPairs.add(pairKey);

      const aOwesB = debtMatrix.get(a.id)?.get(b.id) || 0;
      const bOwesA = debtMatrix.get(b.id)?.get(a.id) || 0;

      let netDebtorId: string | null = null;
      let netCreditorId: string | null = null;
      let netAmount = 0;

      if (aOwesB > bOwesA) {
        netDebtorId = a.id;
        netCreditorId = b.id;
        netAmount = aOwesB - bOwesA;
      } else if (bOwesA > aOwesB) {
        netDebtorId = b.id;
        netCreditorId = a.id;
        netAmount = bOwesA - aOwesB;
      }

      pairwiseResults.push({
        memberAId: a.id,
        memberAName: memberMap.get(a.id) || a.id,
        memberBId: b.id,
        memberBName: memberMap.get(b.id) || b.id,
        aOwesB,
        bOwesA,
        netDebtorId,
        netCreditorId,
        netAmount
      });
    }
  }

  return pairwiseResults;
}

/**
 * Tính số dư ròng của tất cả thành viên trong nhóm (BR-15).
 * Số dư ròng = (tổng người khác nợ mình) - (tổng mình nợ người khác)
 */
export function calculateMemberNetBalances(
  members: { id: string; name: string }[],
  obligations: Pick<DebtObligation, 'debtorMemberId' | 'creditorMemberId' | 'remainingAmount' | 'status'>[],
  totalPaidByMember: Map<string, number> = new Map(),
  totalExpenseByMember: Map<string, number> = new Map()
): MemberNetBalance[] {
  const owedToOthers = new Map<string, number>();
  const owedByOthers = new Map<string, number>();

  for (const m of members) {
    owedToOthers.set(m.id, 0);
    owedByOthers.set(m.id, 0);
  }

  for (const ob of obligations) {
    if (ob.status === 'CANCELLED') continue;
    const remaining = ob.remainingAmount;
    if (remaining <= 0) continue;

    owedToOthers.set(ob.debtorMemberId, (owedToOthers.get(ob.debtorMemberId) || 0) + remaining);
    owedByOthers.set(ob.creditorMemberId, (owedByOthers.get(ob.creditorMemberId) || 0) + remaining);
  }

  return members.map((m) => {
    const toOthers = owedToOthers.get(m.id) || 0;
    const byOthers = owedByOthers.get(m.id) || 0;
    return {
      memberId: m.id,
      memberName: m.name,
      totalPaid: totalPaidByMember.get(m.id) || 0,
      totalExpenseShare: totalExpenseByMember.get(m.id) || 0,
      totalOwedToOthers: toOthers,
      totalOwedByOthers: byOthers,
      netBalance: byOthers - toOthers
    };
  });
}
