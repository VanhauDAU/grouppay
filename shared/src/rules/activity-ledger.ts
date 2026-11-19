/**
 * Sổ cái hoạt động (BR-07, BR-08, BR-16, BR-17, BR-18, BR-19)
 *
 * Gom toàn bộ logic "biến một hoạt động thành nghĩa vụ nợ" vào 1 nơi thuần (pure) để:
 *  - Backend tạo / sửa / hủy hoạt động dùng chung đúng 1 công thức.
 *  - Khi sửa hoặc hủy một hoạt động đã được trả một phần, số tiền đã trả KHÔNG bị mất
 *    và KHÔNG bị tính nợ lại lần 2 (lỗi cũ: nợ cũ đã trả một phần vẫn ACTIVE + sinh thêm nợ mới).
 */

import { splitEqual, validateExactSplit, validatePayers } from './expense-splitting.js';
import { generateObligationsFromExpense } from './debt-calculation.js';

export interface LedgerExpenseInput {
  title: string;
  amount: number;
  splitType: 'EQUAL' | 'EXACT';
  payers: { memberId: string; amountPaid: number }[];
  participants: string[];
  customSplits?: { memberId: string; amountOwed: number }[];
}

export interface LedgerExpense {
  title: string;
  amount: number;
  splitType: 'EQUAL' | 'EXACT';
  payers: { memberId: string; amountPaid: number }[];
  splits: { memberId: string; amountOwed: number; orderIndex: number }[];
}

export interface PairObligation {
  debtorMemberId: string;
  creditorMemberId: string;
  amount: number;
}

export type BuildLedgerResult =
  | { ok: true; expenses: LedgerExpense[]; obligations: PairObligation[]; totalAmount: number }
  | { ok: false; error: string };

/**
 * Kiểm tra + chuẩn hóa toàn bộ khoản chi của một hoạt động và sinh nghĩa vụ nợ đã bù trừ theo cặp.
 * @param allowedMemberIds Tập ID thành viên thuộc nhóm (chặn ID lạ / ID nhóm khác).
 */
export function buildActivityLedger(
  expenses: LedgerExpenseInput[],
  allowedMemberIds: Set<string>
): BuildLedgerResult {
  if (!expenses || expenses.length === 0) {
    return { ok: false, error: 'Hoạt động cần ít nhất 1 khoản chi' };
  }

  const normalized: LedgerExpense[] = [];
  const rawObligations: PairObligation[] = [];
  let totalAmount = 0;

  for (const exp of expenses) {
    // Gộp người trả trùng lặp
    const payerMap = new Map<string, number>();
    for (const p of exp.payers || []) {
      if (!allowedMemberIds.has(p.memberId)) {
        return { ok: false, error: 'Người trả tiền không thuộc nhóm này' };
      }
      payerMap.set(p.memberId, (payerMap.get(p.memberId) || 0) + p.amountPaid);
    }
    const payers = [...payerMap.entries()].map(([memberId, amountPaid]) => ({ memberId, amountPaid }));

    const payerCheck = validatePayers(exp.amount, payers);
    if (!payerCheck.isValid) return { ok: false, error: payerCheck.error! };

    let splits: { memberId: string; amountOwed: number; orderIndex: number }[];
    if (exp.splitType === 'EXACT') {
      if (!exp.customSplits || exp.customSplits.length === 0) {
        return { ok: false, error: 'Thiếu dữ liệu phân bổ số tiền riêng' };
      }
      const splitMap = new Map<string, number>();
      for (const s of exp.customSplits) {
        if (!allowedMemberIds.has(s.memberId)) {
          return { ok: false, error: 'Người chịu chi phí không thuộc nhóm này' };
        }
        splitMap.set(s.memberId, (splitMap.get(s.memberId) || 0) + s.amountOwed);
      }
      const merged = [...splitMap.entries()].map(([memberId, amountOwed]) => ({ memberId, amountOwed }));
      const splitCheck = validateExactSplit(exp.amount, merged);
      if (!splitCheck.isValid) return { ok: false, error: splitCheck.error! };
      splits = merged.filter((s) => s.amountOwed > 0).map((s, idx) => ({ ...s, orderIndex: idx }));
    } else {
      // Loại trùng nhưng giữ thứ tự (thứ tự quyết định ai nhận 1đ lẻ - BR-20)
      const participants = [...new Set(exp.participants || [])];
      if (participants.length === 0) {
        return { ok: false, error: 'Phải có ít nhất 1 người tham gia chịu chi phí' };
      }
      if (participants.some((id) => !allowedMemberIds.has(id))) {
        return { ok: false, error: 'Người chịu chi phí không thuộc nhóm này' };
      }
      splits = splitEqual(exp.amount, participants);
    }

    totalAmount += exp.amount;
    normalized.push({ title: exp.title, amount: exp.amount, splitType: exp.splitType, payers, splits });
    rawObligations.push(...generateObligationsFromExpense(payers, splits));
  }

  return { ok: true, expenses: normalized, obligations: netPairObligations(rawObligations), totalAmount };
}

/** Bù trừ nghĩa vụ nợ hai chiều theo từng cặp thành viên: mỗi cặp còn tối đa 1 chiều. */
export function netPairObligations(obligations: PairObligation[]): PairObligation[] {
  const net = new Map<string, { a: string; b: string; aOwesB: number }>();
  for (const ob of obligations) {
    if (ob.amount <= 0 || ob.debtorMemberId === ob.creditorMemberId) continue;
    const [a, b] = [ob.debtorMemberId, ob.creditorMemberId].sort();
    const key = `${a}|${b}`;
    const entry = net.get(key) || { a, b, aOwesB: 0 };
    entry.aOwesB += ob.debtorMemberId === a ? ob.amount : -ob.amount;
    net.set(key, entry);
  }

  const result: PairObligation[] = [];
  for (const { a, b, aOwesB } of net.values()) {
    if (aOwesB > 0) result.push({ debtorMemberId: a, creditorMemberId: b, amount: aOwesB });
    else if (aOwesB < 0) result.push({ debtorMemberId: b, creditorMemberId: a, amount: -aOwesB });
  }
  return result.sort((x, y) =>
    (x.debtorMemberId + x.creditorMemberId).localeCompare(y.debtorMemberId + y.creditorMemberId)
  );
}

export interface SettledRecord {
  debtorMemberId: string;
  creditorMemberId: string;
  originalAmount: number;
  settledAmount: number;
  sourceType: 'EXPENSE' | 'ADJUSTMENT' | string;
}

export interface ReconciledObligation {
  debtorMemberId: string;
  creditorMemberId: string;
  originalAmount: number;
  settledAmount: number;
  sourceType: 'EXPENSE' | 'ADJUSTMENT';
}

/**
 * Đối soát nghĩa vụ nợ MỚI của hoạt động với số tiền ĐÃ THANH TOÁN trên các nghĩa vụ CŨ (BR-16, BR-18).
 *
 * Với từng cặp (a, b):
 *   netPaid = dòng tiền ròng a đã chuyển cho b liên quan tới hoạt động này.
 *     - Nghĩa vụ EXPENSE: đóng góp settled (tiền đã trả / đã chuyển sang từ lần sửa trước).
 *     - Nghĩa vụ ADJUSTMENT (debtor p -> creditor q, original O): chỉ tồn tại vì trước đó q đã chuyển
 *       thừa O cho p, nên đóng góp vào dòng tiền p->q là (settled − O).
 *   newOwe  = a nợ b theo dữ liệu mới
 * Kết quả cuối cùng a còn nợ b đúng bằng newOwe − netPaid (âm nghĩa là b phải hoàn lại cho a).
 * Phần đã trả được "chuyển" sang nghĩa vụ mới; phần trả thừa sinh nghĩa vụ ADJUSTMENT hoàn tiền.
 */
export function reconcileActivityObligations(
  newObligations: PairObligation[],
  oldSettled: SettledRecord[]
): ReconciledObligation[] {
  const pairs = new Map<string, { a: string; b: string; newOwe: number; netPaid: number }>();
  const getPair = (x: string, y: string) => {
    const [a, b] = [x, y].sort();
    const key = `${a}|${b}`;
    let entry = pairs.get(key);
    if (!entry) {
      entry = { a, b, newOwe: 0, netPaid: 0 };
      pairs.set(key, entry);
    }
    return entry;
  };

  for (const ob of netPairObligations(newObligations)) {
    const p = getPair(ob.debtorMemberId, ob.creditorMemberId);
    p.newOwe += ob.debtorMemberId === p.a ? ob.amount : -ob.amount;
  }
  for (const s of oldSettled) {
    if (s.debtorMemberId === s.creditorMemberId) continue;
    const cash = s.settledAmount - (s.sourceType === 'ADJUSTMENT' ? s.originalAmount : 0);
    if (cash === 0) continue;
    const p = getPair(s.debtorMemberId, s.creditorMemberId);
    p.netPaid += s.debtorMemberId === p.a ? cash : -cash;
  }

  const result: ReconciledObligation[] = [];
  for (const { a, b, newOwe, netPaid } of pairs.values()) {
    // Chuẩn hóa về chiều của khoản nợ mới: debtor -> creditor, owe >= 0
    const flip = newOwe < 0;
    const debtor = flip ? b : a;
    const creditor = flip ? a : b;
    const owe = Math.abs(newOwe);
    const paid = flip ? -netPaid : netPaid; // tiền debtor đã trả creditor (có thể âm)

    if (owe > 0) {
      const carried = Math.max(0, Math.min(paid, owe));
      result.push({
        debtorMemberId: debtor,
        creditorMemberId: creditor,
        originalAmount: owe,
        settledAmount: carried,
        sourceType: 'EXPENSE'
      });
    }

    const overpaid = paid - owe; // > 0: creditor phải hoàn lại cho debtor
    if (overpaid > 0) {
      result.push({
        debtorMemberId: creditor,
        creditorMemberId: debtor,
        originalAmount: overpaid,
        settledAmount: 0,
        sourceType: 'ADJUSTMENT'
      });
    } else if (paid < 0) {
      // Trước đó creditor đã chuyển ngược cho debtor (ví dụ tiền hoàn) -> debtor nợ thêm phần đó
      result.push({
        debtorMemberId: debtor,
        creditorMemberId: creditor,
        originalAmount: -paid,
        settledAmount: 0,
        sourceType: 'ADJUSTMENT'
      });
    }
  }

  return result;
}
