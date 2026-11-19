import React, { useState, useEffect, useRef } from 'react';
import { Modal } from '../../components/common/Modal.js';
import { Avatar } from '../../components/common/Avatar.js';
import { formatVND } from '../../utils/format.js';
import { api } from '../../services/api.js';
import { toast } from 'sonner';
import { playSound } from '../../utils/sound.js';
import { Send, CheckCircle2, Clock } from 'lucide-react';

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
  /** Các yêu cầu của chính mình đang chờ xác nhận (để chặn gửi trùng ngay trên giao diện) */
  pendingPayments?: any[];
  /** Danh sách người mình đang nợ (nợ ròng) để gợi ý số tiền & giới hạn */
  peopleIOwe?: { creditorId: string; amount: number }[];
  onPaymentSuccess: () => void;
}

const newIdempotencyKey = () =>
  `pay_${Date.now().toString(36)}_${(globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)).replace(/-/g, '').slice(0, 16)}`;

export const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  onClose,
  groupCode,
  currentMemberId,
  members,
  initialRecipientId,
  initialAmount,
  pendingPayments = [],
  peopleIOwe = [],
  onPaymentSuccess
}) => {
  // Chỉ hiện những người mình đang thực sự nợ (nếu có dữ liệu), tránh báo trả nhầm người
  const owedIds = new Set(peopleIOwe.map((p) => p.creditorId));
  const otherMembers = members.filter(
    (m) => m.id !== currentMemberId && (owedIds.size === 0 || owedIds.has(m.id) || m.id === initialRecipientId)
  );
  const [recipientId, setRecipientId] = useState<string>('');
  const [amount, setAmount] = useState<number | ''>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  // 1 mã chống trùng cho MỖI LẦN MỞ form: bấm đúp / mạng gửi lại đều được server nhận diện là 1 giao dịch
  const idempotencyKeyRef = useRef<string>(newIdempotencyKey());

  // Khởi tạo lại form mỗi khi mở (không bị ghi đè khi dữ liệu nhóm đồng bộ ngầm)
  useEffect(() => {
    if (!isOpen) return;
    idempotencyKeyRef.current = newIdempotencyKey();
    const firstId = initialRecipientId || otherMembers[0]?.id || '';
    setRecipientId(firstId);
    const owed = peopleIOwe.find((p) => p.creditorId === firstId)?.amount;
    setAmount(initialAmount && initialAmount > 0 ? initialAmount : owed || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialRecipientId, initialAmount]);

  const recipient = members.find((m) => m.id === recipientId);
  const maxOwed = peopleIOwe.find((p) => p.creditorId === recipientId)?.amount || 0;
  const existingPending = pendingPayments.find((p) => p.recipient_member_id === recipientId);

  const handleChangeRecipient = (id: string) => {
    setRecipientId(id);
    const owed = peopleIOwe.find((p) => p.creditorId === id)?.amount;
    if (owed) setAmount(owed);
    idempotencyKeyRef.current = newIdempotencyKey();
  };

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
    if (existingPending) {
      toast.error('Bạn đã có yêu cầu đang chờ người này xác nhận');
      return;
    }
    if (maxOwed > 0 && amt > maxOwed) {
      toast.error(`Bạn chỉ đang nợ ${recipient?.name || 'người này'} ${formatVND(maxOwed)}`);
      return;
    }
    // Khóa đồng bộ bằng ref: chặn cả trường hợp bấm 2 lần trước khi React kịp render lại
    if (submittingRef.current) return;
    submittingRef.current = true;
    setIsSubmitting(true);

    try {
      const res: any = await api.createPayment(groupCode, currentMemberId, {
        payerMemberId: currentMemberId,
        recipientMemberId: recipientId,
        amount: amt,
        idempotencyKey: idempotencyKeyRef.current
      });

      if (res.success) {
        playSound('success');
        toast.success(
          res.duplicated
            ? 'Yêu cầu này đã được gửi trước đó, đang chờ xác nhận.'
            : `Đã báo trả tiền cho ${recipient?.name || 'người nhận'}! Đang chờ xác nhận.`
        );
        idempotencyKeyRef.current = newIdempotencyKey();
        onPaymentSuccess();
        onClose();
      } else {
        toast.error(res.error || 'Không thể gửi thông báo trả tiền');
        if (res.code === 'PENDING_EXISTS') onPaymentSuccess();
      }
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
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
                  onChange={(e) => handleChangeRecipient(e.target.value)}
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
            {maxOwed > 0 && maxOwed !== amount && (
              <button
                type="button"
                onClick={() => setAmount(maxOwed)}
                className="bg-emerald-50 text-emerald-700 border border-emerald-200/80 hover:bg-emerald-100 text-[11px] font-bold px-2.5 py-1.5 rounded-xl transition"
              >
                Trả hết ({formatVND(maxOwed)})
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

        {existingPending && (
          <div className="bg-amber-50 border border-amber-200 p-3.5 rounded-2xl flex items-start space-x-2.5">
            <Clock className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900 leading-relaxed">
              Bạn đã báo chuyển <b>{formatVND(existingPending.total_amount)}</b> cho <b>{recipient?.name}</b> và đang chờ xác nhận.
              Hãy chờ người nhận bấm "Đã nhận" hoặc hủy yêu cầu cũ ở tab Thanh toán trước khi gửi yêu cầu mới.
            </div>
          </div>
        )}

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
            disabled={isSubmitting || !amount || Number(amount) <= 0 || Boolean(existingPending)}
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
