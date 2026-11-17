import React, { useState, useEffect } from 'react';
import { Modal } from '../../components/common/Modal.js';
import { Avatar } from '../../components/common/Avatar.js';
import { formatVND } from '../../utils/format.js';
import { api } from '../../services/api.js';
import { toast } from 'sonner';
import { Send, CheckCircle2, DollarSign } from 'lucide-react';

interface Member {
  id: string;
  name: string;
  avatarUrl?: string | null;
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
  const otherMembers = members.filter((m) => m.id !== currentMemberId);
  const [recipientId, setRecipientId] = useState<string>(initialRecipientId || otherMembers[0]?.id || '');
  const [amount, setAmount] = useState<number | ''>(initialAmount || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (initialRecipientId) {
      setRecipientId(initialRecipientId);
    } else if (otherMembers.length > 0 && !recipientId) {
      setRecipientId(otherMembers[0].id);
    }
  }, [initialRecipientId, otherMembers]);

  useEffect(() => {
    if (initialAmount && initialAmount > 0) {
      setAmount(initialAmount);
    }
  }, [initialAmount]);

  const recipient = members.find((m) => m.id === recipientId);

  const handleQuickAdd = (value: number) => {
    const current = typeof amount === 'number' ? amount : 0;
    setAmount(current + value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentMemberId) {
      toast.error('Vui lòng chọn tên của bạn trước khi thanh toán');
      return;
    }
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      toast.error('Vui lòng nhập số tiền đã trả hợp lệ');
      return;
    }

    if (!recipientId) {
      toast.error('Vui lòng chọn người nhận tiền');
      return;
    }

    setIsSubmitting(true);
    const idempotencyKey = `pay_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const res = await api.createPayment(groupCode, currentMemberId, {
      payerMemberId: currentMemberId,
      recipientMemberId: recipientId,
      amount: amt,
      idempotencyKey
    });
    setIsSubmitting(false);

    if (res.success) {
      toast.success(`Đã báo trả tiền cho ${recipient?.name || 'người nhận'}! Đang chờ xác nhận.`);
      onPaymentSuccess();
      onClose();
    } else {
      toast.error(res.error || 'Không thể gửi thông báo trả tiền');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Báo đã trả tiền" maxWidth="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Người nhận tiền */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
            Người nhận tiền
          </label>
          <div className="grid grid-cols-1 gap-2">
            {otherMembers.length > 1 ? (
              <div className="relative">
                <select
                  value={recipientId}
                  onChange={(e) => setRecipientId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-800 focus:outline-none focus:border-emerald-500 transition appearance-none"
                >
                  {otherMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">
                  ▼
                </div>
              </div>
            ) : recipient ? (
              <div className="flex items-center space-x-3 bg-slate-50 border border-slate-200 p-3 rounded-2xl">
                <Avatar name={recipient.name} avatarUrl={recipient.avatarUrl} size="sm" />
                <span className="font-bold text-slate-800 text-sm">{recipient.name}</span>
              </div>
            ) : (
              <div className="text-xs text-slate-400">Không có thành viên khác trong nhóm</div>
            )}
          </div>
        </div>

        {/* Ô nhập số tiền lớn tự động định dạng */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
            Số tiền đã trả (VND) *
          </label>
          <div className="relative">
            <input
              type="text"
              inputMode="numeric"
              placeholder="0"
              value={amount ? Number(amount).toLocaleString('en-US') : ''}
              onChange={(e) => {
                const raw = e.target.value.replace(/\D/g, '');
                setAmount(raw ? Math.min(Number(raw), 10000000000) : '');
              }}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 pr-12 py-3.5 text-2xl font-black text-slate-900 focus:outline-none focus:border-emerald-500 transition tracking-tight"
              required
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-lg font-black text-slate-400 pointer-events-none select-none">
              đ
            </span>
          </div>

          {/* Phím tắt chọn nhanh */}
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {initialAmount && initialAmount > 0 && initialAmount !== amount && (
              <button
                type="button"
                onClick={() => setAmount(initialAmount)}
                className="bg-emerald-50 text-emerald-700 border border-emerald-200/80 hover:bg-emerald-100 text-[11px] font-bold px-2.5 py-1.5 rounded-xl transition"
              >
                Trả hết ({formatVND(initialAmount)})
              </button>
            )}
            <button
              type="button"
              onClick={() => handleQuickAdd(50000)}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold px-2.5 py-1.5 rounded-xl transition"
            >
              +50k
            </button>
            <button
              type="button"
              onClick={() => handleQuickAdd(100000)}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold px-2.5 py-1.5 rounded-xl transition"
            >
              +100k
            </button>
            <button
              type="button"
              onClick={() => handleQuickAdd(200000)}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold px-2.5 py-1.5 rounded-xl transition"
            >
              +200k
            </button>
            <button
              type="button"
              onClick={() => handleQuickAdd(500000)}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold px-2.5 py-1.5 rounded-xl transition"
            >
              +500k
            </button>
            {amount && (
              <button
                type="button"
                onClick={() => setAmount('')}
                className="bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-500 text-[11px] font-bold px-2.5 py-1.5 rounded-xl transition"
              >
                Xóa
              </button>
            )}
          </div>
        </div>

        {/* Hướng dẫn cơ chế xác nhận */}
        <div className="bg-emerald-50/70 border border-emerald-200/80 p-3.5 rounded-2xl flex items-start space-x-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-emerald-900 leading-relaxed">
            Sau khi bấm gửi, hệ thống sẽ báo cho <b>{recipient?.name || 'người nhận'}</b>. Khi người đó bấm <b>"Đã nhận"</b>, khoản nợ này sẽ chính thức được trừ.
          </div>
        </div>

        {/* Nút hành động chính */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={isSubmitting || !amount || Number(amount) <= 0}
            className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3.5 px-4 rounded-2xl shadow-lg transition active:scale-[0.98] disabled:opacity-50 flex items-center justify-center space-x-2"
          >
            <Send className="w-4 h-4 text-emerald-400" />
            <span>{isSubmitting ? 'Đang gửi...' : 'Tôi đã trả tiền xong (Báo người nhận)'}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};
