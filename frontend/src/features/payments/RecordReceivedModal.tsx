import React, { useLayoutEffect, useRef, useState } from 'react';
import { HandCoins, Info } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from '../../components/common/Modal.js';
import { Avatar } from '../../components/common/Avatar.js';
import { api } from '../../services/api.js';
import { formatVND } from '../../utils/format.js';
import { playSound } from '../../utils/sound.js';

interface RecordReceivedModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupCode: string;
  currentMemberId?: string | null;
  debtor: { id: string; name: string; avatarUrl?: string | null; amount: number } | null;
  onSuccess: () => void;
}

const newKey = () => `rcv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;

/**
 * Người được nợ tự ghi nhận đã nhận tiền (trả ngoài app / quên bấm "Báo trả").
 * Có hiệu lực ngay, lưu lịch sử và báo cho người trả.
 */
export const RecordReceivedModal: React.FC<RecordReceivedModalProps> = ({
  isOpen,
  onClose,
  groupCode,
  currentMemberId,
  debtor,
  onSuccess
}) => {
  const [amount, setAmount] = useState<number | ''>('');
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const lockRef = useRef(false);
  const keyRef = useRef(newKey());

  useLayoutEffect(() => {
    if (!isOpen || !debtor) return;
    setAmount(debtor.amount);
    setNote('');
    keyRef.current = newKey();
  }, [isOpen, debtor?.id]);

  if (!debtor) return null;
  const amt = Number(amount) || 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentMemberId) return toast.error('Vui lòng chọn tên của bạn trước');
    if (amt <= 0) return toast.error('Nhập số tiền đã nhận');
    if (amt > debtor.amount) return toast.error(`${debtor.name} chỉ đang nợ bạn ${formatVND(debtor.amount)}`);
    if (lockRef.current) return;
    lockRef.current = true;
    setIsSubmitting(true);
    try {
      const res: any = await api.recordReceived(groupCode, currentMemberId, {
        debtorMemberId: debtor.id,
        amount: amt,
        note: note.trim() || undefined,
        idempotencyKey: keyRef.current
      });
      if (res.success) {
        playSound('money');
        toast.success(`Đã ghi nhận nhận ${formatVND(amt)} từ ${debtor.name}`);
        onSuccess();
        onClose();
      } else {
        toast.error(res.error || 'Không thể ghi nhận');
        if (res.code === 'PENDING_EXISTS') {
          onSuccess();
          onClose();
        }
      }
    } finally {
      lockRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Ghi nhận đã nhận tiền" maxWidth="sm">
      <form onSubmit={submit} className="space-y-3.5">
        <div className="flex items-center gap-3 bg-slate-50 border border-slate-200/80 p-3 rounded-2xl">
          <Avatar name={debtor.name} avatarUrl={debtor.avatarUrl} size="sm" />
          <div className="text-xs">
            <div className="font-bold text-slate-800">{debtor.name}</div>
            <div className="text-slate-500">
              đang nợ bạn <b className="text-emerald-600">{formatVND(debtor.amount)}</b>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">Số tiền đã nhận</label>
          <div className="relative">
            <input
              type="text"
              inputMode="numeric"
              value={amount ? Number(amount).toLocaleString('vi-VN') : ''}
              onChange={(e) => {
                const raw = e.target.value.replace(/\D/g, '');
                setAmount(raw ? Number(raw) : '');
              }}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 pr-10 py-3 text-xl font-black focus:outline-none focus:border-emerald-500"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 font-black text-slate-400">đ</span>
          </div>
          {amt !== debtor.amount && (
            <button
              type="button"
              onClick={() => setAmount(debtor.amount)}
              className="mt-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-lg"
            >
              Nhận đủ {formatVND(debtor.amount)}
            </button>
          )}
        </div>

        <input
          type="text"
          placeholder="Ghi chú (vd: trả tiền mặt hôm 10/11)"
          value={note}
          maxLength={200}
          onChange={(e) => setNote(e.target.value)}
          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold focus:outline-none"
        />

        <div className="flex gap-2 text-[11px] text-slate-500 bg-amber-50/70 border border-amber-200/70 p-2.5 rounded-xl">
          <Info className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
          <span>Dùng khi {debtor.name} đã trả ngoài app hoặc quên bấm "Báo trả". Khoản nợ được trừ ngay và {debtor.name} sẽ nhận thông báo.</span>
        </div>

        <button
          type="submit"
          disabled={isSubmitting || amt <= 0}
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-3 rounded-2xl text-sm flex items-center justify-center gap-2 transition active:scale-[0.98] disabled:opacity-50"
        >
          <HandCoins className="w-4 h-4" />
          {isSubmitting ? 'Đang lưu...' : `Xác nhận đã nhận ${amt > 0 ? formatVND(amt) : ''}`}
        </button>
      </form>
    </Modal>
  );
};
