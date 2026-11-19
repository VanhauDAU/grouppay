import React, { useState } from 'react';
import { ArrowRight, Send, CheckCircle2, ChevronDown, HandCoins } from 'lucide-react';
import { Modal } from '../../components/common/Modal.js';
import { formatVND } from '../../utils/format.js';
import { Avatar } from '../../components/common/Avatar.js';

interface ObligationItem {
  id: string;
  debtorMemberId: string;
  creditorMemberId: string;
  debtorName: string;
  creditorName: string;
  originalAmount: number;
  settledAmount: number;
  remainingAmount: number;
  sourceType: string;
  activityTitle?: string;
  activityOccurredAt?: string;
  createdAt: string;
  status: string;
}

interface PairwiseItem {
  memberAId: string;
  memberAName: string;
  memberBId: string;
  memberBName: string;
  aOwesB: number;
  bOwesA: number;
  netDebtorId: string | null;
  netCreditorId: string | null;
  netAmount: number;
}

interface PairwiseDebtDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  pair: PairwiseItem | null;
  obligations: ObligationItem[];
  members?: { id: string; name: string; avatarUrl?: string | null }[];
  currentMemberId?: string | null;
  onOpenPaymentModal?: (recipientId?: string, defaultAmount?: number) => void;
  onOpenRecordReceived?: (debtorId: string, amount: number) => void;
}

const shortName = (name: string) => name.trim().split(/\s+/).pop() || name;
const shortDate = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
};

export const PairwiseDebtDetailModal: React.FC<PairwiseDebtDetailModalProps> = ({
  isOpen,
  onClose,
  pair,
  obligations,
  members,
  currentMemberId,
  onOpenPaymentModal,
  onOpenRecordReceived
}) => {
  const [showSettled, setShowSettled] = useState(false);
  if (!pair) return null;

  const { memberAId, memberAName, memberBId, memberBName, aOwesB, bOwesA, netDebtorId, netCreditorId, netAmount } = pair;
  const nameOf = (id: string | null) => (id === memberAId ? memberAName : memberBName);
  const avatarOf = (id: string | null) => members?.find((m) => m.id === id)?.avatarUrl;
  const label = (id: string | null) => (id === currentMemberId ? 'Bạn' : shortName(nameOf(id)));

  // Góc nhìn: người đang nợ ròng (nếu cân bằng thì lấy A)
  const debtorId = netDebtorId || memberAId;
  const creditorId = netDebtorId ? netCreditorId : memberBId;

  const between = obligations.filter(
    (ob) =>
      (ob.debtorMemberId === memberAId && ob.creditorMemberId === memberBId) ||
      (ob.debtorMemberId === memberBId && ob.creditorMemberId === memberAId)
  );
  const byDate = (x: ObligationItem, y: ObligationItem) =>
    new Date(y.activityOccurredAt || y.createdAt).getTime() - new Date(x.activityOccurredAt || x.createdAt).getTime();
  const open = between.filter((ob) => ob.remainingAmount > 0).sort(byDate);
  const settled = between.filter((ob) => ob.remainingAmount <= 0).sort(byDate);

  const debtorOwes = debtorId === memberAId ? aOwesB : bOwesA;
  const creditorOwes = debtorId === memberAId ? bOwesA : aOwesB;
  const isMeDebtor = currentMemberId === netDebtorId;
  const isMeCreditor = currentMemberId === netCreditorId;

  /** Mô tả ngắn nguồn gốc khoản nợ */
  const describe = (ob: ObligationItem) => {
    if (ob.sourceType === 'INITIAL_DEBT') return 'Nợ cũ nhập tay';
    if (ob.sourceType === 'ADJUSTMENT') return 'Hoàn tiền sau khi sửa / hủy';
    return `${label(ob.creditorMemberId)} trả tiền`;
  };

  const Row: React.FC<{ ob: ObligationItem; done?: boolean }> = ({ ob, done }) => {
    const addsToDebt = ob.debtorMemberId === debtorId; // + tăng nợ của người đang nợ, − bù trừ
    const amount = done ? ob.originalAmount : ob.remainingAmount;
    return (
      <div className="flex items-center gap-2.5 py-2">
        <div className="w-9 text-center text-[10px] font-bold text-slate-400 leading-tight flex-shrink-0">
          {shortDate(ob.activityOccurredAt || ob.createdAt)}
        </div>
        <div className="min-w-0 flex-1">
          <div className={`text-[13px] font-semibold truncate ${done ? 'text-slate-400' : 'text-slate-800'}`}>
            {ob.activityTitle || 'Khoản chi'}
          </div>
          <div className="text-[10.5px] text-slate-400 truncate">
            {describe(ob)}
            {!done && ob.settledAmount > 0 && <> · đã trả {formatVND(ob.settledAmount)}/{formatVND(ob.originalAmount)}</>}
          </div>
        </div>
        {done ? (
          <span className="flex items-center gap-1 text-[12px] font-bold text-slate-400 whitespace-nowrap">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            {formatVND(amount)}
          </span>
        ) : (
          <span
            className={`text-[13px] font-extrabold tabular-nums whitespace-nowrap ${
              addsToDebt ? 'text-rose-600' : 'text-emerald-600'
            }`}
          >
            {addsToDebt ? '+' : '−'}
            {formatVND(amount)}
          </span>
        )}
      </div>
    );
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Đối chiếu công nợ" maxWidth="md">
      <div className="space-y-3.5">
        {/* 1. Kết luận: ai trả ai bao nhiêu */}
        <div className="rounded-2xl border border-slate-200/80 bg-gradient-to-b from-slate-50 to-white p-4 text-center">
          <div className="flex items-center justify-center gap-3">
            <div className="flex flex-col items-center gap-1 w-20">
              <Avatar name={nameOf(debtorId)} avatarUrl={avatarOf(debtorId)} size="md" />
              <span className="text-[11px] font-bold text-slate-700 truncate max-w-full">{label(debtorId)}</span>
            </div>
            <ArrowRight className={`w-5 h-5 ${netAmount > 0 ? 'text-rose-400' : 'text-slate-300'}`} />
            <div className="flex flex-col items-center gap-1 w-20">
              <Avatar name={nameOf(creditorId)} avatarUrl={avatarOf(creditorId)} size="md" />
              <span className="text-[11px] font-bold text-slate-700 truncate max-w-full">{label(creditorId)}</span>
            </div>
          </div>

          {netAmount > 0 ? (
            <>
              <div className="mt-3 text-[12px] text-slate-500">
                <b className="text-slate-700">{label(debtorId)}</b> cần trả <b className="text-slate-700">{label(creditorId)}</b>
              </div>
              <div className="text-[28px] font-black text-rose-600 tracking-tight leading-tight">{formatVND(netAmount)}</div>
            </>
          ) : (
            <div className="mt-3 flex items-center justify-center gap-1.5 text-sm font-extrabold text-emerald-700">
              <CheckCircle2 className="w-4 h-4" /> Hai bên không còn nợ nhau
            </div>
          )}

          {netAmount > 0 && isMeDebtor && onOpenPaymentModal && (
            <button
              onClick={() => {
                onClose();
                onOpenPaymentModal(netCreditorId || undefined, netAmount);
              }}
              className="mt-3 w-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs py-2.5 rounded-xl flex items-center justify-center gap-1.5 active:scale-[0.98] transition"
            >
              <Send className="w-3.5 h-3.5 text-emerald-400" /> Báo đã trả tiền
            </button>
          )}
          {netAmount > 0 && isMeCreditor && onOpenRecordReceived && netDebtorId && (
            <button
              onClick={() => {
                onClose();
                onOpenRecordReceived(netDebtorId, netAmount);
              }}
              className="mt-3 w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2.5 rounded-xl flex items-center justify-center gap-1.5 active:scale-[0.98] transition"
            >
              <HandCoins className="w-3.5 h-3.5" /> Ghi nhận đã nhận tiền
            </button>
          )}
        </div>

        {/* 2. Phép tính — chỉ hiện khi hai bên cùng nợ nhau (có bù trừ) */}
        {debtorOwes > 0 && creditorOwes > 0 && (
          <div className="rounded-2xl bg-slate-50 px-3.5 py-2.5 text-[12px] space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-500">{label(debtorId)} nợ {label(creditorId)}</span>
              <span className="font-bold text-rose-600 tabular-nums">+{formatVND(debtorOwes)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">{label(creditorId)} nợ lại {label(debtorId)} (bù trừ)</span>
              <span className="font-bold text-emerald-600 tabular-nums">−{formatVND(creditorOwes)}</span>
            </div>
            <div className="flex justify-between pt-1 border-t border-slate-200">
              <span className="font-bold text-slate-700">Còn phải trả</span>
              <span className="font-black text-slate-900 tabular-nums">{formatVND(netAmount)}</span>
            </div>
          </div>
        )}

        {/* 3. Các khoản đang tính */}
        <div>
          <div className="flex items-center justify-between px-0.5 mb-0.5">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Khoản đang tính ({open.length})
            </span>
            {open.length > 0 && (
              <span className="text-[10px] text-slate-400">
                <span className="text-rose-500 font-bold">+</span> thêm nợ ·{' '}
                <span className="text-emerald-600 font-bold">−</span> trừ nợ
              </span>
            )}
          </div>
          {open.length === 0 ? (
            <div className="text-center text-xs text-slate-400 py-3">Không còn khoản nào chưa trả</div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
              {open.map((ob) => (
                <Row key={ob.id} ob={ob} />
              ))}
            </div>
          )}
        </div>

        {/* 4. Khoản đã trả xong (thu gọn) */}
        {settled.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setShowSettled(!showSettled)}
              className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1 px-0.5"
            >
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showSettled ? 'rotate-180' : ''}`} />
              Đã trả xong ({settled.length})
            </button>
            {showSettled && (
              <div className="divide-y divide-slate-100 max-h-56 overflow-y-auto animate-fade-in">
                {settled.map((ob) => (
                  <Row key={ob.id} ob={ob} done />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};
