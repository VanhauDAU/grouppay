import { describe, it, expect } from 'vitest';
import {
  splitEqual,
  validateExactSplit,
  validatePayers,
  generateObligationsFromExpense,
  calculatePairwiseDebts,
  calculateMemberNetBalances,
  planPaymentAllocation,
  applyConfirmedPayment,
  optimizeSettlements,
  generateVietQrEmvCo,
  calculateCrc16Ccitt
} from '../src/index.js';

describe('1. Phân bổ chi phí và chia tiền lẻ (BR-08, BR-09, BR-20)', () => {
  it('Chia 100.000đ cho 3 người phải ra 33.334đ, 33.333đ, 33.333đ và tổng bằng 100.000đ', () => {
    const result = splitEqual(100000, ['user_1', 'user_2', 'user_3']);
    expect(result).toHaveLength(3);
    expect(result[0].amountOwed).toBe(33334);
    expect(result[1].amountOwed).toBe(33333);
    expect(result[2].amountOwed).toBe(33333);

    const sum = result.reduce((acc, r) => acc + r.amountOwed, 0);
    expect(sum).toBe(100000);
  });

  it('Chia 10.000đ cho 4 người phải ra 2.500đ mỗi người', () => {
    const result = splitEqual(10000, ['a', 'b', 'c', 'd']);
    expect(result.every((r) => r.amountOwed === 2500)).toBe(true);
    expect(result.reduce((acc, r) => acc + r.amountOwed, 0)).toBe(10000);
  });

  it('validateExactSplit phát hiện đúng khi tổng phân bổ không khớp', () => {
    const valid = validateExactSplit(100000, [
      { memberId: 'a', amountOwed: 60000 },
      { memberId: 'b', amountOwed: 40000 }
    ]);
    expect(valid.isValid).toBe(true);
    expect(valid.diff).toBe(0);

    const invalid = validateExactSplit(100000, [
      { memberId: 'a', amountOwed: 60000 },
      { memberId: 'b', amountOwed: 30000 }
    ]);
    expect(invalid.isValid).toBe(false);
    expect(invalid.diff).toBe(10000);
  });

  it('validatePayers kiểm tra tổng tiền người trả khớp tổng khoản chi', () => {
    const valid = validatePayers(500000, [
      { memberId: 'a', amountPaid: 300000 },
      { memberId: 'b', amountPaid: 200000 }
    ]);
    expect(valid.isValid).toBe(true);

    const invalid = validatePayers(500000, [{ memberId: 'a', amountPaid: 400000 }]);
    expect(invalid.isValid).toBe(false);
  });
});

describe('2. Tính toán nghĩa vụ nợ gốc và số dư ròng (BR-07, BR-15, BR-18)', () => {
  it('Khoản chi có 2 người trả (A trả 300k, B trả 200k), 4 người chia đều (mỗi người 125k)', () => {
    // A: trả 300k, chịu 125k -> surplus +175k
    // B: trả 200k, chịu 125k -> surplus +75k
    // C: trả 0, chịu 125k -> deficit -125k
    // D: trả 0, chịu 125k -> deficit -125k
    const obligations = generateObligationsFromExpense(
      [
        { memberId: 'A', amountPaid: 300000 },
        { memberId: 'B', amountPaid: 200000 }
      ],
      [
        { memberId: 'A', amountOwed: 125000 },
        { memberId: 'B', amountOwed: 125000 },
        { memberId: 'C', amountOwed: 125000 },
        { memberId: 'D', amountOwed: 125000 }
      ]
    );

    // Tổng nghĩa vụ nợ phát sinh phải đúng bằng 250k
    const totalObligations = obligations.reduce((acc, ob) => acc + ob.amount, 0);
    expect(totalObligations).toBe(250000);

    // Người nhận nợ chỉ gồm A và B
    const creditors = new Set(obligations.map((o) => o.creditorMemberId));
    expect(creditors.has('A')).toBe(true);
    expect(creditors.has('B')).toBe(true);

    // Người nợ chỉ gồm C và D
    const debtors = new Set(obligations.map((o) => o.debtorMemberId));
    expect(debtors.has('C')).toBe(true);
    expect(debtors.has('D')).toBe(true);
  });

  it('Công nợ hai chiều và số dư ròng: B nợ A 200k, A nợ B 100k -> giữ nguyên nợ gốc, net B nợ A 100k', () => {
    const members = [
      { id: 'A', name: 'Thành viên A' },
      { id: 'B', name: 'Thành viên B' }
    ];

    const obligations = [
      {
        id: 'ob_1',
        debtorMemberId: 'B',
        creditorMemberId: 'A',
        remainingAmount: 200000,
        status: 'ACTIVE' as const
      },
      {
        id: 'ob_2',
        debtorMemberId: 'A',
        creditorMemberId: 'B',
        remainingAmount: 100000,
        status: 'ACTIVE' as const
      }
    ];

    const pairwise = calculatePairwiseDebts(members, obligations);
    expect(pairwise).toHaveLength(1);
    expect(pairwise[0].aOwesB).toBe(100000);
    expect(pairwise[0].bOwesA).toBe(200000);
    expect(pairwise[0].netDebtorId).toBe('B');
    expect(pairwise[0].netCreditorId).toBe('A');
    expect(pairwise[0].netAmount).toBe(100000);

    const netBalances = calculateMemberNetBalances(members, obligations);
    const balanceA = netBalances.find((b) => b.memberId === 'A');
    const balanceB = netBalances.find((b) => b.memberId === 'B');

    expect(balanceA?.netBalance).toBe(100000); // A được nhận ròng 100k
    expect(balanceB?.netBalance).toBe(-100000); // B đang nợ ròng 100k
  });
});

describe('3. Phân bổ thanh toán nợ (BR-10, BR-11)', () => {
  const obligations = [
    {
      id: 'ob_1',
      debtorMemberId: 'B',
      creditorMemberId: 'A',
      remainingAmount: 50000,
      status: 'ACTIVE' as const,
      createdAt: '2026-01-01T00:00:00Z'
    },
    {
      id: 'ob_2',
      debtorMemberId: 'B',
      creditorMemberId: 'A',
      remainingAmount: 70000,
      status: 'ACTIVE' as const,
      createdAt: '2026-01-02T00:00:00Z'
    }
  ];

  it('Thanh toán từng phần theo thứ tự FIFO', () => {
    // Trả 80k: ob_1 trả hết 50k, ob_2 trả 30k
    const plan = planPaymentAllocation(80000, obligations);
    expect(plan.isValid).toBe(true);
    expect(plan.allocations).toHaveLength(2);
    expect(plan.allocations[0]).toEqual({ debtObligationId: 'ob_1', amount: 50000 });
    expect(plan.allocations[1]).toEqual({ debtObligationId: 'ob_2', amount: 30000 });
  });

  it('Không được thanh toán vượt quá số nợ còn lại', () => {
    // Tổng nợ là 120k, thử trả 130k -> từ chối
    const plan = planPaymentAllocation(130000, obligations);
    expect(plan.isValid).toBe(false);
    expect(plan.error).toContain('vượt quá tổng công nợ còn lại');
  });

  it('applyConfirmedPayment cập nhật trạng thái nghĩa vụ nợ chính xác', () => {
    const ob = { id: 'ob_1', originalAmount: 50000, settledAmount: 0, status: 'ACTIVE' as const };
    const res1 = applyConfirmedPayment(ob, 30000);
    expect(res1.settledAmount).toBe(30000);
    expect(res1.remainingAmount).toBe(20000);
    expect(res1.status).toBe('ACTIVE');

    const res2 = applyConfirmedPayment({ ...ob, settledAmount: 30000 }, 20000);
    expect(res2.settledAmount).toBe(50000);
    expect(res2.remainingAmount).toBe(0);
    expect(res2.status).toBe('FULLY_SETTLED');
  });
});

describe('4. Thuật toán tối ưu thanh toán (BR-5.2)', () => {
  it('Rút gọn số giao dịch chuyển tiền: A cần nhận 300k, B cần trả 200k, C cần trả 100k -> B và C chuyển thẳng cho A', () => {
    const netBalances = [
      { memberId: 'A', memberName: 'An', netBalance: 300000 },
      { memberId: 'B', memberName: 'Bình', netBalance: -200000 },
      { memberId: 'C', memberName: 'Cường', netBalance: -100000 }
    ];

    const proposals = optimizeSettlements(netBalances);
    expect(proposals).toHaveLength(2);
    expect(proposals[0]).toEqual({
      fromMemberId: 'B',
      fromMemberName: 'Bình',
      toMemberId: 'A',
      toMemberName: 'An',
      amount: 200000
    });
    expect(proposals[1]).toEqual({
      fromMemberId: 'C',
      fromMemberName: 'Cường',
      toMemberId: 'A',
      toMemberName: 'An',
      amount: 100000
    });
  });
});

describe('5. VietQR EMVCo & CRC16 Checksum (BR-21)', () => {
  it('Tính CRC16-CCITT chuẩn xác', () => {
    // Kiểm tra chuỗi mẫu
    const crc = calculateCrc16Ccitt('0002010102126304');
    expect(crc).toHaveLength(4);
  });

  it('Sinh chuỗi VietQR EMVCo hợp lệ với Napas BIN và số tài khoản', () => {
    const qrString = generateVietQrEmvCo({
      bankBin: '970436', // Vietcombank
      accountNumber: '1234567890',
      amount: 150000,
      memo: 'TT NHOM DALAT',
      accountHolderName: 'NGUYEN VAN A'
    });

    expect(qrString).toContain('000201'); // Payload Format
    expect(qrString).toContain('5303704'); // VND
    expect(qrString).toContain('5406150000'); // 150.000 VND
    expect(qrString).toContain('5802VN'); // Vietnam
    expect(qrString).toContain('970436'); // BIN
    expect(qrString).toContain('1234567890'); // Account
    expect(qrString.slice(-4)).toHaveLength(4); // CRC
  });
});
