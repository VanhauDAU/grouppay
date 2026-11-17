import React, { useState } from 'react';
import { Modal } from '../../components/common/Modal.js';
import { VietQrCard } from '../../components/common/VietQrCard.js';
import { formatVND } from '../../utils/format.js';
import { api } from '../../services/api.js';
import { toast } from 'sonner';

interface Member {
  id: string;
  name: string;
  bankAccount?: any;
}

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupCode: string;
  currentMemberId?: string | null;
  members: Member[];
  initialRecipientId?: string | null;
  initialAmount?: number;
  onPaymentSuccess: () => void;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  onClose,
  groupCode,
  currentMemberId,
  members,
  initialRecipientId,
  initialAmount,
  onPaymentSuccess
}) => {
  const [recipientId, setRecipientId] = useState(initialRecipientId || members[0]?.id || '');
  const [amount, setAmount] = useState<number | ''>(initialAmount || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const recipient = members.find((m) => m.id === recipientId);
  const bank = recipient?.bankAccount;

  // Nội dung chuyển khoản chuẩn hóa
  const transferMemo = `TT NHOM ${groupCode.toUpperCase()}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentMemberId) {
      toast.error('Vui lòng chọn tên của bạn trước khi thanh toán');
      return;
    }
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      toast.error('Vui lòng nhập số tiền thanh toán hợp lệ');
      return;
    }

    setIsSubmitting(true);
    // Sinh idempotency key duy nhất cho lần thanh toán này
    const idempotencyKey = `pay_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const res = await api.createPayment(groupCode, currentMemberId, {
      payerMemberId: currentMemberId,
      recipientMemberId: recipientId,
      amount: amt,
      idempotencyKey
    });
    setIsSubmitting(false);

    if (res.success) {
      toast.success('Đã gửi thông báo chuyển tiền! Chờ người nhận xác nhận.');
      onPaymentSuccess();
      onClose();
    } else {
      toast.error(res.error || 'Không thể tạo thanh toán');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Chuyển khoản thanh toán nợ" maxWidth="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Chọn người nhận */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Người nhận tiền *
          </label>
          <select
            value={recipientId}
            onChange={(e) => setRecipientId(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-emerald-500 transition"
          >
            {members
              .filter((m) => m.id !== currentMemberId)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} {m.bankAccount ? `(${m.bankAccount.bankCode})` : '(Chưa có STK)'}
                </option>
              ))}
          </select>
        </div>

        {/* Nhập số tiền */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Số tiền chuyển (VND) *
          </label>
          <input
            type="number"
            placeholder="Ví dụ: 100000"
            value={amount}
            onChange={(e) => setAmount(e.target.value ? Number(e.target.value) : '')}
            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-emerald-500 transition"
            required
          />
        </div>

        {/* Hiển thị VietQR Card nếu người nhận đã có thông tin ngân hàng */}
        {bank && bank.isQrEnabled && bank.bankBin && bank.accountNumber ? (
          <div className="pt-2">
            <VietQrCard
              bankBin={bank.bankBin}
              bankCode={bank.bankCode}
              bankName={bank.bankName}
              accountNumber={bank.accountNumber}
              accountHolder={bank.accountHolder}
              amount={typeof amount === 'number' && amount > 0 ? amount : undefined}
              memo={transferMemo}
            />
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl text-xs text-amber-800">
            Người nhận chưa cài đặt tài khoản ngân hàng. Bạn có thể thanh toán tiền mặt hoặc chuyển khoản thủ công, sau đó bấm nút bên dưới để báo cho người nhận.
          </div>
        )}

        <div className="pt-3">
          <button
            type="submit"
            disabled={isSubmitting || !amount || Number(amount) <= 0}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-2xl shadow-lg shadow-emerald-600/25 transition active:scale-[0.98] disabled:opacity-50"
          >
            {isSubmitting ? 'Đang gửi thông báo...' : 'Tôi đã chuyển tiền xong (Báo người nhận)'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
