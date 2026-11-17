/**
 * Business Rules for Settlement Optimization (BR-5.2)
 * Thuật toán đề xuất phương án thanh toán tối giản số giao dịch dựa trên số dư ròng hiện tại.
 * Đây CHỈ LÀ GỢI Ý ĐỀ XUẤT, không tự động thay đổi dữ liệu hoặc trừ nợ gốc.
 */

import type { MemberNetBalance, SettlementProposal } from '../types/index.js';

/**
 * Tính toán phương án chuyển tiền tối giản từ số dư ròng.
 * Bảo toàn 100% số dư ròng của tất cả thành viên:
 * Tổng tiền mỗi người phải trả và được nhận trước và sau tối ưu là giống hệt nhau.
 */
export function optimizeSettlements(
  netBalances: Pick<MemberNetBalance, 'memberId' | 'memberName' | 'netBalance'>[]
): SettlementProposal[] {
  // Tách nhóm con nợ (netBalance < 0) và chủ nợ (netBalance > 0)
  const debtors: { memberId: string; memberName: string; amount: number }[] = [];
  const creditors: { memberId: string; memberName: string; amount: number }[] = [];

  for (const item of netBalances) {
    if (item.netBalance < 0) {
      debtors.push({
        memberId: item.memberId,
        memberName: item.memberName,
        amount: Math.abs(item.netBalance)
      });
    } else if (item.netBalance > 0) {
      creditors.push({
        memberId: item.memberId,
        memberName: item.memberName,
        amount: item.netBalance
      });
    }
  }

  // Sắp xếp giảm dần theo số tiền để ưu tiên ghép cặp các khoản lớn trước
  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const proposals: SettlementProposal[] = [];
  let dIdx = 0;
  let cIdx = 0;

  while (dIdx < debtors.length && cIdx < creditors.length) {
    const debtor = debtors[dIdx];
    const creditor = creditors[cIdx];

    const amount = Math.min(debtor.amount, creditor.amount);
    if (amount > 0) {
      proposals.push({
        fromMemberId: debtor.memberId,
        fromMemberName: debtor.memberName,
        toMemberId: creditor.memberId,
        toMemberName: creditor.memberName,
        amount
      });

      debtor.amount -= amount;
      creditor.amount -= amount;
    }

    if (debtor.amount === 0) dIdx++;
    if (creditor.amount === 0) cIdx++;
  }

  return proposals;
}
