import { describe, it, expect } from 'vitest';
import {
  buildActivityLedger,
  reconcileActivityObligations,
  netPairObligations,
  planConfirmedSettlement,
  calculateMemberNetBalances,
  calculatePairwiseDebts
} from '../src/index.js';

const MEMBERS = new Set(['A', 'B', 'C', 'D']);

/** Số dư ròng của từng người sau khi áp dụng danh sách nghĩa vụ (remaining = original - settled) */
function netOf(obs: { debtorMemberId: string; creditorMemberId: string; originalAmount: number; settledAmount: number }[]) {
  const net: Record<string, number> = {};
  for (const ob of obs) {
    const rem = ob.originalAmount - ob.settledAmount;
    net[ob.debtorMemberId] = (net[ob.debtorMemberId] || 0) - rem;
    net[ob.creditorMemberId] = (net[ob.creditorMemberId] || 0) + rem;
  }
  return net;
}

describe('6. Sổ cái hoạt động: dựng nghĩa vụ nợ', () => {
  it('A trả 300k cho 3 người A,B,C chia đều -> B nợ A 100k, C nợ A 100k', () => {
    const r = buildActivityLedger(
      [{ title: 'Ăn', amount: 300000, splitType: 'EQUAL', payers: [{ memberId: 'A', amountPaid: 300000 }], participants: ['A', 'B', 'C'] }],
      MEMBERS
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.totalAmount).toBe(300000);
    expect(r.obligations).toEqual([
      { debtorMemberId: 'B', creditorMemberId: 'A', amount: 100000 },
      { debtorMemberId: 'C', creditorMemberId: 'A', amount: 100000 }
    ]);
  });

  it('Người tham gia bị trùng không bị tính 2 suất', () => {
    const r = buildActivityLedger(
      [{ title: 'x', amount: 100000, splitType: 'EQUAL', payers: [{ memberId: 'A', amountPaid: 100000 }], participants: ['A', 'B', 'B'] }],
      MEMBERS
    );
    expect(r.ok && r.obligations).toEqual([{ debtorMemberId: 'B', creditorMemberId: 'A', amount: 50000 }]);
  });

  it('Chặn thành viên ngoài nhóm và EXACT lệch tổng', () => {
    const outsider = buildActivityLedger(
      [{ title: 'x', amount: 1000, splitType: 'EQUAL', payers: [{ memberId: 'Z', amountPaid: 1000 }], participants: ['A'] }],
      MEMBERS
    );
    expect(outsider.ok).toBe(false);

    const badExact = buildActivityLedger(
      [{
        title: 'x', amount: 1000, splitType: 'EXACT', payers: [{ memberId: 'A', amountPaid: 1000 }], participants: ['A', 'B'],
        customSplits: [{ memberId: 'A', amountOwed: 500 }, { memberId: 'B', amountOwed: 400 }]
      }],
      MEMBERS
    );
    expect(badExact.ok).toBe(false);
  });

  it('Hai khoản chi ngược chiều trong cùng hoạt động được bù trừ còn 1 chiều', () => {
    const r = buildActivityLedger(
      [
        { title: '1', amount: 200000, splitType: 'EQUAL', payers: [{ memberId: 'A', amountPaid: 200000 }], participants: ['A', 'B'] },
        { title: '2', amount: 60000, splitType: 'EQUAL', payers: [{ memberId: 'B', amountPaid: 60000 }], participants: ['A', 'B'] }
      ],
      MEMBERS
    );
    expect(r.ok && r.obligations).toEqual([{ debtorMemberId: 'B', creditorMemberId: 'A', amount: 70000 }]);
  });

  it('Tổng nghĩa vụ luôn bảo toàn: số dư ròng = đã trả − phải chịu', () => {
    const r = buildActivityLedger(
      [{
        title: 'x', amount: 1000001, splitType: 'EQUAL',
        payers: [{ memberId: 'A', amountPaid: 600000 }, { memberId: 'C', amountPaid: 400001 }],
        participants: ['A', 'B', 'C', 'D']
      }],
      MEMBERS
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const net = netOf(r.obligations.map((o) => ({ ...o, originalAmount: o.amount, settledAmount: 0 })));
    // mỗi người chịu 250001/250000/250000/250000 (1đ lẻ cho người đầu)
    expect(net.A).toBe(600000 - 250001);
    expect(net.B).toBe(-250000);
    expect(net.C).toBe(400001 - 250000);
    expect(net.D).toBe(-250000);
  });
});

describe('7. Sửa / hủy hoạt động sau khi đã thanh toán (BR-16, BR-17, BR-18)', () => {
  it('Chỉ đổi tên (số tiền giữ nguyên) sau khi B đã trả đủ -> B KHÔNG bị nợ lại', () => {
    const result = reconcileActivityObligations(
      [{ debtorMemberId: 'B', creditorMemberId: 'A', amount: 50000 }],
      [{ debtorMemberId: 'B', creditorMemberId: 'A', originalAmount: 50000, settledAmount: 50000, sourceType: 'EXPENSE' }]
    );
    expect(result).toEqual([
      { debtorMemberId: 'B', creditorMemberId: 'A', originalAmount: 50000, settledAmount: 50000, sourceType: 'EXPENSE' }
    ]);
    expect(netOf(result).B).toBe(0);
  });

  it('B đã trả 20k/50k, sửa tăng lên 80k -> B còn nợ 60k (không phải 30k + 80k)', () => {
    const result = reconcileActivityObligations(
      [{ debtorMemberId: 'B', creditorMemberId: 'A', amount: 80000 }],
      [{ debtorMemberId: 'B', creditorMemberId: 'A', originalAmount: 20000, settledAmount: 20000, sourceType: 'EXPENSE' }]
    );
    expect(netOf(result).B).toBe(-60000);
  });

  it('B đã trả đủ 50k, sửa giảm còn 30k -> A phải hoàn lại B 20k', () => {
    const result = reconcileActivityObligations(
      [{ debtorMemberId: 'B', creditorMemberId: 'A', amount: 30000 }],
      [{ debtorMemberId: 'B', creditorMemberId: 'A', originalAmount: 50000, settledAmount: 50000, sourceType: 'EXPENSE' }]
    );
    expect(netOf(result)).toEqual({ A: -20000, B: 20000 });
    expect(result.find((r) => r.sourceType === 'ADJUSTMENT')).toEqual({
      debtorMemberId: 'A', creditorMemberId: 'B', originalAmount: 20000, settledAmount: 0, sourceType: 'ADJUSTMENT'
    });
  });

  it('Hủy hoạt động khi B đã trả 20k -> A hoàn lại B đúng 20k, phần chưa trả bị xóa', () => {
    const result = reconcileActivityObligations([], [{ debtorMemberId: 'B', creditorMemberId: 'A', originalAmount: 20000, settledAmount: 20000, sourceType: 'EXPENSE' }]);
    expect(netOf(result)).toEqual({ A: -20000, B: 20000 });
  });

  it('Hủy hoạt động chưa ai trả -> không còn nghĩa vụ nào', () => {
    expect(reconcileActivityObligations([], [])).toEqual([]);
  });

  it('Đổi người trả: trước B nợ A (đã trả 50k), giờ A nợ B 40k -> A nợ B 90k', () => {
    const result = reconcileActivityObligations(
      [{ debtorMemberId: 'A', creditorMemberId: 'B', amount: 40000 }],
      [{ debtorMemberId: 'B', creditorMemberId: 'A', originalAmount: 50000, settledAmount: 50000, sourceType: 'EXPENSE' }]
    );
    expect(netOf(result)).toEqual({ A: -90000, B: 90000 });
  });

  it('Sửa nhiều lần: tiền hoàn đã được trả cũng được tính đúng', () => {
    // Lần 1 B trả 50k, sửa còn 30k -> A hoàn 20k (ADJUSTMENT), A đã hoàn 20k.
    // Lần 2 sửa lại 50k: tiền ròng B->A = 50k - 20k = 30k -> B còn nợ 20k
    const result = reconcileActivityObligations(
      [{ debtorMemberId: 'B', creditorMemberId: 'A', amount: 50000 }],
      [
        { debtorMemberId: 'B', creditorMemberId: 'A', originalAmount: 30000, settledAmount: 30000, sourceType: 'EXPENSE' },
        { debtorMemberId: 'A', creditorMemberId: 'B', originalAmount: 20000, settledAmount: 20000, sourceType: 'ADJUSTMENT' }
      ]
    );
    expect(netOf(result).B).toBe(-20000);

    // Nếu A CHƯA hoàn 20k mà sửa lại 50k: B đã chuyển ròng 50k -> hết nợ, không ai nợ ai
    const notRefunded = reconcileActivityObligations(
      [{ debtorMemberId: 'B', creditorMemberId: 'A', amount: 50000 }],
      [
        { debtorMemberId: 'B', creditorMemberId: 'A', originalAmount: 30000, settledAmount: 30000, sourceType: 'EXPENSE' },
        { debtorMemberId: 'A', creditorMemberId: 'B', originalAmount: 20000, settledAmount: 0, sourceType: 'ADJUSTMENT' }
      ]
    );
    expect(netOf(notRefunded)).toEqual({ A: 0, B: 0 });
  });

  it('Chuỗi sửa thực tế: mô phỏng đầy đủ qua kết quả của chính hàm', () => {
    // B nợ A 50k, B trả đủ 50k
    let state = reconcileActivityObligations([{ debtorMemberId: 'B', creditorMemberId: 'A', amount: 50000 }], []);
    state = state.map((o) => ({ ...o, settledAmount: o.originalAmount }));
    // Sửa còn 30k -> A phải hoàn 20k
    state = reconcileActivityObligations([{ debtorMemberId: 'B', creditorMemberId: 'A', amount: 30000 }], state);
    expect(netOf(state)).toEqual({ A: -20000, B: 20000 });
    // Hủy hoạt động -> A phải hoàn toàn bộ 50k B đã chuyển
    const cancelled = reconcileActivityObligations([], state);
    expect(netOf(cancelled)).toEqual({ A: -50000, B: 50000 });
  });

  it('netPairObligations bỏ qua tự nợ chính mình và số 0', () => {
    expect(
      netPairObligations([
        { debtorMemberId: 'A', creditorMemberId: 'A', amount: 10 },
        { debtorMemberId: 'A', creditorMemberId: 'B', amount: 0 }
      ])
    ).toEqual([]);
  });
});

describe('8. Xác nhận thanh toán & tổng công nợ', () => {
  const obs = [
    { id: 'o2', remainingAmount: 30000, status: 'ACTIVE' as const, createdAt: '2026-01-02' },
    { id: 'o1', remainingAmount: 50000, status: 'ACTIVE' as const, createdAt: '2026-01-01' },
    { id: 'o3', remainingAmount: 90000, status: 'CANCELLED' as const, createdAt: '2026-01-01' }
  ];

  it('Trừ FIFO, bỏ qua nợ đã hủy', () => {
    expect(planConfirmedSettlement(60000, obs)).toEqual({
      allocations: [
        { debtObligationId: 'o1', amount: 50000 },
        { debtObligationId: 'o2', amount: 10000 }
      ],
      excessAmount: 0
    });
  });

  it('Tiền chuyển vượt nợ hiện tại -> trả về phần dư để ghi nợ ngược, không mất tiền', () => {
    expect(planConfirmedSettlement(100000, obs).excessAmount).toBe(20000);
  });

  it('Tổng "cần trả"/"được nhận" khớp với nợ ròng từng cặp', () => {
    const members = [{ id: 'A', name: 'A' }, { id: 'B', name: 'B' }, { id: 'C', name: 'C' }];
    const list = [
      { debtorMemberId: 'A', creditorMemberId: 'B', remainingAmount: 100000, status: 'ACTIVE' as const },
      { debtorMemberId: 'B', creditorMemberId: 'A', remainingAmount: 30000, status: 'ACTIVE' as const },
      { debtorMemberId: 'C', creditorMemberId: 'A', remainingAmount: 10000, status: 'ACTIVE' as const }
    ];
    const balances = calculateMemberNetBalances(members, list);
    const A = balances.find((b) => b.memberId === 'A')!;
    expect(A.totalOwedToOthers).toBe(70000);
    expect(A.totalOwedByOthers).toBe(10000);
    expect(A.netBalance).toBe(-60000);

    const pairwise = calculatePairwiseDebts(members, list);
    const owedByA = pairwise.filter((p) => p.netDebtorId === 'A').reduce((s, p) => s + p.netAmount, 0);
    expect(owedByA).toBe(A.totalOwedToOthers);
    // Tổng số dư ròng toàn nhóm luôn = 0
    expect(balances.reduce((s, b) => s + b.netBalance, 0)).toBe(0);
  });
});

import { formatGroupCode, normalizeGroupCodeInput, isFriendlyGroupCode } from '../src/index.js';

describe('9. Mã tham gia nhóm dễ đọc', () => {
  it('Định dạng & chuẩn hóa mọi kiểu nhập', () => {
    expect(formatGroupCode('K7MQ4XPZ')).toBe('K7MQ-4XPZ');
    expect(formatGroupCode('Q7V72swF36')).toBe('Q7V72swF36'); // mã cũ giữ nguyên
    expect(normalizeGroupCodeInput('k7mq-4xpz')).toBe('K7MQ4XPZ');
    expect(normalizeGroupCodeInput(' K7MQ 4XPZ ')).toBe('K7MQ4XPZ');
    expect(normalizeGroupCodeInput('https://sononghiatinh.pages.dev/group/K7MQ4XPZ')).toBe('K7MQ4XPZ');
    expect(normalizeGroupCodeInput('https://x.dev/?group=k7mq4xpz')).toBe('K7MQ4XPZ');
    expect(normalizeGroupCodeInput('https://x.dev/group/Q7V72swF36')).toBe('Q7V72swF36');
    expect(isFriendlyGroupCode('K7MQ4XP0')).toBe(false); // có số 0 dễ nhầm -> không thuộc bảng ký tự
  });
});
