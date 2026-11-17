/**
 * Business Rules for Payment Allocation (BR-10, BR-11, BR-12, BR-13, BR-14)
 * Quản lý phân bổ thanh toán nợ theo nguyên tắc FIFO và kiểm tra giới hạn nợ nghiêm ngặt.
 */

import type { DebtObligation } from '../types/index.js';

export interface AllocationPlan {
  debtObligationId: string;
  amount: number;
}

export interface PaymentAllocationResult {
  isValid: boolean;
  totalRemainingDebt: number;
  paymentAmount: number;
  allocations: AllocationPlan[];
  error?: string;
}

/**
 * Phân bổ số tiền thanh toán vào các nghĩa vụ nợ gốc theo thứ tự FIFO (BR-10).
 * Bắt buộc kiểm tra: Số tiền thanh toán không được vượt quá tổng công nợ còn lại.
 */
export function planPaymentAllocation(
  paymentAmount: number,
  obligations: Pick<DebtObligation, 'id' | 'debtorMemberId' | 'creditorMemberId' | 'remainingAmount' | 'status' | 'createdAt'>[]
): PaymentAllocationResult {
  if (!Number.isInteger(paymentAmount) || paymentAmount <= 0) {
    return {
      isValid: false,
      totalRemainingDebt: 0,
      paymentAmount,
      allocations: [],
      error: 'Số tiền thanh toán phải là số nguyên dương'
    };
  }

  // Lọc các nghĩa vụ nợ còn hiệu lực và còn nợ
  const activeObligations = obligations
    .filter((ob) => ob.status === 'ACTIVE' && ob.remainingAmount > 0)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const totalRemainingDebt = activeObligations.reduce((acc, ob) => acc + ob.remainingAmount, 0);

  if (paymentAmount > totalRemainingDebt) {
    return {
      isValid: false,
      totalRemainingDebt,
      paymentAmount,
      allocations: [],
      error: `Số tiền thanh toán (${paymentAmount.toLocaleString('vi-VN')}đ) vượt quá tổng công nợ còn lại (${totalRemainingDebt.toLocaleString('vi-VN')}đ)`
    };
  }

  const allocations: AllocationPlan[] = [];
  let remainingPayment = paymentAmount;

  for (const ob of activeObligations) {
    if (remainingPayment <= 0) break;

    const alloc = Math.min(remainingPayment, ob.remainingAmount);
    allocations.push({
      debtObligationId: ob.id,
      amount: alloc
    });
    remainingPayment -= alloc;
  }

  return {
    isValid: true,
    totalRemainingDebt,
    paymentAmount,
    allocations
  };
}

/**
 * Áp dụng phân bổ thanh toán khi giao dịch được xác nhận (CONFIRMED - BR-11, BR-14).
 * Trả về danh sách cập nhật cho từng nghĩa vụ nợ.
 */
export function applyConfirmedPayment(
  obligation: Pick<DebtObligation, 'id' | 'originalAmount' | 'settledAmount' | 'status'>,
  allocatedAmount: number
): {
  id: string;
  settledAmount: number;
  remainingAmount: number;
  status: 'ACTIVE' | 'FULLY_SETTLED';
} {
  const newSettled = obligation.settledAmount + allocatedAmount;
  const newRemaining = obligation.originalAmount - newSettled;
  const newStatus = newRemaining <= 0 ? 'FULLY_SETTLED' : 'ACTIVE';

  return {
    id: obligation.id,
    settledAmount: newSettled,
    remainingAmount: Math.max(0, newRemaining),
    status: newStatus
  };
}
