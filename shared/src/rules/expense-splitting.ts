/**
 * Business Rules for Expense Splitting (BR-08, BR-09, BR-19, BR-20)
 * Đảm bảo phân bổ chi phí không chênh lệch dù chỉ 1 VND và thứ tự phân bổ phần lẻ ổn định.
 */

export interface SplitResult {
  memberId: string;
  amountOwed: number; // integer VND
  orderIndex: number;
}

export interface PayerValidationResult {
  isValid: boolean;
  totalPaid: number;
  expectedAmount: number;
  diff: number;
  error?: string;
}

export interface SplitValidationResult {
  isValid: boolean;
  totalSplit: number;
  expectedAmount: number;
  diff: number;
  error?: string;
}

/**
 * Chia đều tổng tiền cho danh sách thành viên với quy tắc chia tiền lẻ cố định (BR-20).
 * Ví dụ: 100.000đ cho 3 người -> 33.334đ, 33.333đ, 33.333đ.
 */
export function splitEqual(totalAmount: number, memberIds: string[]): SplitResult[] {
  if (!Number.isInteger(totalAmount) || totalAmount <= 0) {
    throw new Error('Tổng tiền phải là số nguyên dương');
  }
  if (!memberIds || memberIds.length === 0) {
    throw new Error('Danh sách thành viên không được rỗng');
  }

  const n = memberIds.length;
  const baseShare = Math.floor(totalAmount / n);
  const remainder = totalAmount % n;

  // Giữ thứ tự cố định dựa trên index
  return memberIds.map((memberId, idx) => {
    const extra = idx < remainder ? 1 : 0;
    return {
      memberId,
      amountOwed: baseShare + extra,
      orderIndex: idx
    };
  });
}

/**
 * Kiểm tra tính hợp lệ của phân bổ số tiền riêng (BR-08, BR-19).
 */
export function validateExactSplit(
  totalAmount: number,
  splits: { memberId: string; amountOwed: number }[]
): SplitValidationResult {
  if (!Number.isInteger(totalAmount) || totalAmount <= 0) {
    return {
      isValid: false,
      totalSplit: 0,
      expectedAmount: totalAmount,
      diff: totalAmount,
      error: 'Tổng tiền phải là số nguyên dương'
    };
  }

  let totalSplit = 0;
  for (const item of splits) {
    if (!Number.isInteger(item.amountOwed) || item.amountOwed < 0) {
      return {
        isValid: false,
        totalSplit,
        expectedAmount: totalAmount,
        diff: totalAmount - totalSplit,
        error: `Số tiền phân bổ của thành viên ${item.memberId} không hợp lệ (phải là số nguyên >= 0)`
      };
    }
    totalSplit += item.amountOwed;
  }

  const diff = totalAmount - totalSplit;
  if (diff !== 0) {
    return {
      isValid: false,
      totalSplit,
      expectedAmount: totalAmount,
      diff,
      error: `Tổng tiền phân bổ (${totalSplit.toLocaleString('vi-VN')}đ) không khớp tổng khoản chi (${totalAmount.toLocaleString('vi-VN')}đ). Lệch: ${diff.toLocaleString('vi-VN')}đ`
    };
  }

  return {
    isValid: true,
    totalSplit,
    expectedAmount: totalAmount,
    diff: 0
  };
}

/**
 * Kiểm tra những người thanh toán khoản chi (BR-07, BR-19).
 * Tổng số tiền do những người thanh toán đóng góp phải bằng tổng tiền khoản chi.
 */
export function validatePayers(
  totalAmount: number,
  payers: { memberId: string; amountPaid: number }[]
): PayerValidationResult {
  if (!Number.isInteger(totalAmount) || totalAmount <= 0) {
    return {
      isValid: false,
      totalPaid: 0,
      expectedAmount: totalAmount,
      diff: totalAmount,
      error: 'Tổng tiền phải là số nguyên dương'
    };
  }

  if (!payers || payers.length === 0) {
    return {
      isValid: false,
      totalPaid: 0,
      expectedAmount: totalAmount,
      diff: totalAmount,
      error: 'Phải có ít nhất 1 người thanh toán'
    };
  }

  let totalPaid = 0;
  for (const payer of payers) {
    if (!Number.isInteger(payer.amountPaid) || payer.amountPaid <= 0) {
      return {
        isValid: false,
        totalPaid,
        expectedAmount: totalAmount,
        diff: totalAmount - totalPaid,
        error: `Số tiền thanh toán của thành viên ${payer.memberId} phải là số nguyên > 0`
      };
    }
    totalPaid += payer.amountPaid;
  }

  const diff = totalAmount - totalPaid;
  if (diff !== 0) {
    return {
      isValid: false,
      totalPaid,
      expectedAmount: totalAmount,
      diff,
      error: `Tổng tiền do người trả thanh toán (${totalPaid.toLocaleString('vi-VN')}đ) không khớp tổng khoản chi (${totalAmount.toLocaleString('vi-VN')}đ). Lệch: ${diff.toLocaleString('vi-VN')}đ`
    };
  }

  return {
    isValid: true,
    totalPaid,
    expectedAmount: totalAmount,
    diff: 0
  };
}
