import React, { useState, useLayoutEffect, useRef, useMemo } from 'react';
import { Check, ChevronDown, Users, Wand2 } from 'lucide-react';
import { Modal } from '../../components/common/Modal.js';
import { api } from '../../services/api.js';
import { toast } from 'sonner';
import { formatVND } from '../../utils/format.js';
import { Avatar } from '../../components/common/Avatar.js';
import { playSound } from '../../utils/sound.js';

interface Member {
  id: string;
  name: string;
  status: string;
  avatarUrl?: string | null;
}

interface CreateActivityModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupCode: string;
  currentMemberId?: string | null;
  members: Member[];
  onSuccess: () => void;
}

type MoneyMap = Record<string, number | ''>;

/** Giờ địa phương dạng yyyy-MM-ddTHH:mm cho input datetime-local (toISOString() là giờ UTC -> lệch 7 tiếng) */
function nowLocalInput() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

/** Tên gọi ngắn (tên riêng tiếng Việt là từ cuối): "Lê Văn Hậu" -> "Hậu" */
function shortName(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1] || name;
}

/** Chia đều có quy tắc 1đ lẻ cho người đứng trước (khớp BR-20 ở server) */
function splitEven(total: number, ids: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  if (ids.length === 0 || total <= 0) return out;
  const base = Math.floor(total / ids.length);
  const rem = total % ids.length;
  ids.forEach((id, i) => (out[id] = base + (i < rem ? 1 : 0)));
  return out;
}

const sumOf = (map: MoneyMap, ids: string[]) => ids.reduce((acc, id) => acc + (Number(map[id]) || 0), 0);

const MoneyInput: React.FC<{ value: number | ''; onChange: (v: number | '') => void; ariaLabel: string }> = ({
  value,
  onChange,
  ariaLabel
}) => (
  <div className="relative">
    <input
      type="text"
      inputMode="numeric"
      placeholder="0"
      aria-label={ariaLabel}
      value={value ? Number(value).toLocaleString('vi-VN') : ''}
      onChange={(e) => {
        const raw = e.target.value.replace(/\D/g, '');
        onChange(raw ? Math.min(Number(raw), 10_000_000_000) : '');
      }}
      className="w-full bg-white border border-slate-200 rounded-lg pl-2 pr-5 py-1 text-right font-bold text-xs focus:outline-none focus:border-slate-800"
    />
    <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 pointer-events-none">
      đ
    </span>
  </div>
);

/** Thanh trạng thái khớp tổng: "Đã nhập x / y" + Khớp / Thiếu / Thừa */
const MatchBar: React.FC<{ label: string; current: number; total: number; onAutoFix?: () => void }> = ({
  label,
  current,
  total,
  onAutoFix
}) => {
  if (total <= 0) return null;
  const diff = total - current;
  return (
    <div className="flex items-center justify-between text-[11px] pt-1.5">
      <span className="text-slate-500">
        {label}: <b className="text-slate-700">{formatVND(current)}</b> / {formatVND(total)}
      </span>
      {diff === 0 ? (
        <span className="text-emerald-600 font-bold flex items-center gap-0.5">
          <Check className="w-3 h-3 stroke-[3]" /> Khớp
        </span>
      ) : (
        <span className="flex items-center gap-1.5">
          <span className="text-rose-500 font-bold">
            {diff > 0 ? `Thiếu ${formatVND(diff)}` : `Thừa ${formatVND(-diff)}`}
          </span>
          {onAutoFix && (
            <button
              type="button"
              onClick={onAutoFix}
              className="text-[10px] font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 px-1.5 py-0.5 rounded-md flex items-center gap-0.5"
            >
              <Wand2 className="w-3 h-3" /> Chia đều
            </button>
          )}
        </span>
      )}
    </div>
  );
};

export const CreateActivityModal: React.FC<CreateActivityModalProps> = ({
  isOpen,
  onClose,
  groupCode,
  currentMemberId,
  members,
  onSuccess
}) => {
  const activeMembers = useMemo(() => members.filter((m) => m.status === 'ACTIVE'), [members]);
  const activeIds = useMemo(() => activeMembers.map((m) => m.id), [activeMembers]);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [occurredAt, setOccurredAt] = useState(nowLocalInput);
  const [expenseAmount, setExpenseAmount] = useState<number | ''>('');

  // Người trả: 1 người (mặc định) hoặc nhiều người
  const [multiPayer, setMultiPayer] = useState(false);
  const [payerIds, setPayerIds] = useState<string[]>([]);
  const [payerAmounts, setPayerAmounts] = useState<MoneyMap>({});

  // Chia cho: đều hoặc số tiền riêng
  const [splitType, setSplitType] = useState<'EQUAL' | 'EXACT'>('EQUAL');
  const [participants, setParticipants] = useState<string[]>([]);
  const [customSplits, setCustomSplits] = useState<MoneyMap>({});

  const [showMore, setShowMore] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);

  // Khởi tạo form MỖI LẦN MỞ. Không phụ thuộc `members` để dữ liệu đồng bộ ngầm (realtime)
  // không xóa mất lựa chọn người dùng đang thao tác dở.
  useLayoutEffect(() => {
    if (!isOpen) return;
    const ids = members.filter((m) => m.status === 'ACTIVE').map((m) => m.id);
    const me = currentMemberId && ids.includes(currentMemberId) ? currentMemberId : ids[0];
    setPayerIds(me ? [me] : []);
    setParticipants(ids);
    setMultiPayer(false);
    setPayerAmounts({});
    setSplitType('EQUAL');
    setCustomSplits({});
    setOccurredAt(nowLocalInput());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const amt = Number(expenseAmount) || 0;
  const orderedParticipants = activeIds.filter((id) => participants.includes(id));
  const equalPreview = splitEven(amt, orderedParticipants);
  const perPersonBase = orderedParticipants.length > 0 ? Math.floor(amt / orderedParticipants.length) : 0;
  const hasRemainder = orderedParticipants.length > 0 && amt % orderedParticipants.length !== 0;

  const togglePayer = (id: string) => {
    if (!multiPayer) {
      setPayerIds([id]);
      return;
    }
    setPayerIds((prev) => {
      if (prev.includes(id)) {
        if (prev.length <= 1) {
          toast.error('Phải có ít nhất 1 người trả tiền');
          return prev;
        }
        return prev.filter((x) => x !== id);
      }
      return [...prev, id];
    });
  };

  const setMultiMode = (on: boolean) => {
    setMultiPayer(on);
    if (!on) setPayerIds((prev) => prev.slice(0, 1));
    else if (amt > 0) setPayerAmounts(splitEven(amt, payerIds));
  };

  const toggleParticipant = (id: string) => {
    setParticipants((prev) => {
      if (prev.includes(id)) {
        if (prev.length <= 1) {
          toast.error('Phải có ít nhất 1 người chịu chi phí');
          return prev;
        }
        return prev.filter((x) => x !== id);
      }
      return [...prev, id];
    });
  };

  const toggleAllParticipants = () => {
    if (participants.length === activeIds.length) {
      setParticipants(payerIds.slice(0, 1));
    } else {
      setParticipants(activeIds);
    }
  };

  const orderedPayers = activeIds.filter((id) => payerIds.includes(id));
  const totalPayers = sumOf(payerAmounts, orderedPayers);
  const totalCustom = sumOf(customSplits, orderedParticipants);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setExpenseAmount('');
    setPayerAmounts({});
    setCustomSplits({});
    setShowMore(false);
  };

  const handleCreateActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return toast.error('Vui lòng nhập tên hoạt động');
    if (!amt || amt <= 0) return toast.error('Vui lòng nhập số tiền chi tiêu hợp lệ');
    if (orderedParticipants.length === 0) return toast.error('Vui lòng chọn ít nhất 1 người chịu chi phí');
    if (orderedPayers.length === 0) return toast.error('Vui lòng chọn người trả tiền');

    let payersPayload: { memberId: string; amountPaid: number }[];
    if (!multiPayer || orderedPayers.length === 1) {
      payersPayload = [{ memberId: orderedPayers[0], amountPaid: amt }];
    } else {
      payersPayload = orderedPayers
        .map((id) => ({ memberId: id, amountPaid: Number(payerAmounts[id]) || 0 }))
        .filter((p) => p.amountPaid > 0);
      const paid = payersPayload.reduce((a, p) => a + p.amountPaid, 0);
      if (paid !== amt) {
        return toast.error(`Tiền người trả (${formatVND(paid)}) chưa khớp tổng ${formatVND(amt)}`);
      }
    }

    let customPayload: { memberId: string; amountOwed: number }[] | undefined;
    if (splitType === 'EXACT') {
      if (totalCustom !== amt) {
        return toast.error(`Tổng chia (${formatVND(totalCustom)}) chưa khớp tổng ${formatVND(amt)}`);
      }
      customPayload = orderedParticipants.map((id) => ({ memberId: id, amountOwed: Number(customSplits[id]) || 0 }));
    }

    // Khóa bằng ref: chặn bấm đúp tạo 2 hoạt động trùng
    if (submittingRef.current) return;
    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      const creatorId = currentMemberId || payersPayload[0].memberId;
      const res = await api.createActivity(groupCode, creatorId, {
        title: title.trim(),
        description: description.trim() || undefined,
        occurredAt: new Date(occurredAt).toISOString(),
        expenses: [
          {
            title: title.trim(),
            amount: amt,
            splitType,
            payers: payersPayload,
            participants: orderedParticipants,
            customSplits: customPayload
          }
        ]
      });

      if (res.success) {
        playSound('success');
        toast.success('Đã lưu khoản chi!');
        resetForm();
        onSuccess();
        onClose();
      } else {
        playSound('error');
        toast.error(res.error || 'Không thể tạo hoạt động');
      }
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const segBtn = (active: boolean) =>
    `px-2 py-0.5 rounded-md transition ${active ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500'}`;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Thêm hoạt động chi tiêu" maxWidth="md">
      <form onSubmit={handleCreateActivity} className="space-y-3">
        {/* 1. Số tiền */}
        <div className="bg-slate-50/80 p-3 rounded-2xl border border-slate-200/90 text-center">
          <div className="flex items-center justify-center">
            <div className="inline-flex items-baseline space-x-1.5 border-b-2 border-slate-300 focus-within:border-slate-900 pb-0.5 transition">
              <input
                type="text"
                inputMode="numeric"
                placeholder="0"
                aria-label="Số tiền chi tiêu"
                value={expenseAmount ? Number(expenseAmount).toLocaleString('vi-VN') : ''}
                onChange={(e) => {
                  const raw = e.target.value.replace(/\D/g, '');
                  setExpenseAmount(raw ? Math.min(Number(raw), 10_000_000_000) : '');
                }}
                className="text-right text-3xl font-black text-slate-900 bg-transparent border-none focus:outline-none placeholder-slate-300 tracking-tight"
                size={Math.max(2, expenseAmount ? Number(expenseAmount).toLocaleString('vi-VN').length : 1)}
                required
                autoFocus
              />
              <span className="text-2xl font-black text-slate-500 select-none">đ</span>
            </div>
          </div>
          <div className="flex items-center justify-center gap-1.5 mt-2">
            {[50000, 100000, 200000, 500000].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setExpenseAmount((Number(expenseAmount) || 0) + v)}
                className="text-[11px] font-bold text-slate-600 bg-white hover:bg-slate-100 border border-slate-200/80 px-2 py-0.5 rounded-lg transition active:scale-95"
              >
                +{v / 1000}k
              </button>
            ))}
            {amt > 0 && (
              <button
                type="button"
                onClick={() => setExpenseAmount('')}
                className="text-[11px] font-bold text-rose-500 bg-white hover:bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-lg transition active:scale-95"
              >
                Xóa
              </button>
            )}
          </div>
        </div>

        {/* 2. Tên */}
        <input
          type="text"
          placeholder="Tên khoản chi: Ăn trưa, Cà phê, Tiền phòng..."
          aria-label="Tên hoạt động"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-slate-800 transition"
          required
        />

        {/* 3. Ai trả — 1 hàng cuộn ngang, chạm 1 lần */}
        <section className="rounded-2xl border border-slate-200/90 p-2.5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Ai trả?</span>
            <div className="flex bg-slate-100 p-0.5 rounded-lg text-[11px] font-bold">
              <button type="button" className={segBtn(!multiPayer)} onClick={() => setMultiMode(false)}>
                1 người
              </button>
              <button type="button" className={segBtn(multiPayer)} onClick={() => setMultiMode(true)}>
                Nhiều người
              </button>
            </div>
          </div>

          <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-0.5 px-0.5 pb-0.5">
            {activeMembers.map((m) => {
              const selected = payerIds.includes(m.id);
              return (
                <button
                  type="button"
                  key={m.id}
                  onClick={() => togglePayer(m.id)}
                  aria-pressed={selected}
                  className={`flex-shrink-0 pl-1 pr-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 ${
                    selected ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-600 border border-slate-200/80'
                  }`}
                >
                  <Avatar name={m.name} avatarUrl={m.avatarUrl} size="xs" />
                  <span>{m.id === currentMemberId ? 'Tôi' : shortName(m.name)}</span>
                  {selected && <Check className="w-3 h-3 stroke-[3] text-emerald-400" />}
                </button>
              );
            })}
          </div>

          {multiPayer && (
            <div className="mt-2 pt-2 border-t border-slate-100">
              <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
                {orderedPayers.map((id) => {
                  const m = activeMembers.find((x) => x.id === id)!;
                  return (
                    <label key={id} className="flex items-center gap-1.5 text-xs">
                      <span className="font-semibold text-slate-700 truncate w-12 flex-shrink-0">
                        {id === currentMemberId ? 'Tôi' : shortName(m.name)}
                      </span>
                      <MoneyInput
                        ariaLabel={`Tiền ${m.name} đã trả`}
                        value={payerAmounts[id] ?? ''}
                        onChange={(v) => setPayerAmounts((prev) => ({ ...prev, [id]: v }))}
                      />
                    </label>
                  );
                })}
              </div>
              <MatchBar
                label="Đã trả"
                current={totalPayers}
                total={amt}
                onAutoFix={() => setPayerAmounts(splitEven(amt, orderedPayers))}
              />
            </div>
          )}
        </section>

        {/* 4. Chia cho — lưới avatar gọn, chạm để bật/tắt */}
        <section className="rounded-2xl border border-slate-200/90 p-2.5">
          <div className="flex items-center justify-between mb-2 gap-2">
            <button
              type="button"
              onClick={toggleAllParticipants}
              className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1"
              title={participants.length === activeIds.length ? 'Bỏ chọn hết' : 'Chọn tất cả'}
            >
              <Users className="w-3.5 h-3.5 text-slate-400" />
              Chia cho {orderedParticipants.length}/{activeIds.length}
            </button>
            <div className="flex bg-slate-100 p-0.5 rounded-lg text-[11px] font-bold">
              <button type="button" className={segBtn(splitType === 'EQUAL')} onClick={() => setSplitType('EQUAL')}>
                Chia đều
              </button>
              <button
                type="button"
                className={segBtn(splitType === 'EXACT')}
                onClick={() => {
                  setSplitType('EXACT');
                  if (amt > 0 && totalCustom === 0) setCustomSplits(splitEven(amt, orderedParticipants));
                }}
              >
                Số riêng
              </button>
            </div>
          </div>

          <div className="grid grid-cols-5 gap-1">
            {activeMembers.map((m) => {
              const checked = participants.includes(m.id);
              const share = splitType === 'EQUAL' ? equalPreview[m.id] : Number(customSplits[m.id]) || 0;
              return (
                <button
                  type="button"
                  key={m.id}
                  onClick={() => toggleParticipant(m.id)}
                  aria-pressed={checked}
                  className={`relative flex flex-col items-center gap-0.5 py-1.5 rounded-xl transition active:scale-95 ${
                    checked ? 'bg-slate-900/[0.04]' : 'opacity-40 grayscale'
                  }`}
                >
                  <div className="relative">
                    <Avatar name={m.name} avatarUrl={m.avatarUrl} size="sm" />
                    {checked && (
                      <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 ring-2 ring-white flex items-center justify-center">
                        <Check className="w-2.5 h-2.5 text-white stroke-[3.5]" />
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] font-semibold text-slate-700 truncate max-w-full px-0.5">
                    {m.id === currentMemberId ? 'Tôi' : shortName(m.name)}
                  </span>
                  {checked && amt > 0 && splitType === 'EQUAL' && (
                    <span className="text-[9px] font-bold text-slate-400 leading-none">
                      {(share / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}k
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {splitType === 'EQUAL' && amt > 0 && orderedParticipants.length > 0 && (
            <div className="text-[11px] text-slate-500 mt-1.5 flex items-center justify-between px-0.5">
              <span>Mỗi người</span>
              <span className="font-bold text-slate-800">
                {formatVND(perPersonBase)}
                {hasRemainder && <span className="font-medium text-slate-400"> (+1đ lẻ cho vài người)</span>}
              </span>
            </div>
          )}

          {splitType === 'EXACT' && (
            <div className="mt-2 pt-2 border-t border-slate-100">
              <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
                {orderedParticipants.map((id) => {
                  const m = activeMembers.find((x) => x.id === id)!;
                  return (
                    <label key={id} className="flex items-center gap-1.5 text-xs">
                      <span className="font-semibold text-slate-700 truncate w-12 flex-shrink-0">
                        {id === currentMemberId ? 'Tôi' : shortName(m.name)}
                      </span>
                      <MoneyInput
                        ariaLabel={`Phần của ${m.name}`}
                        value={customSplits[id] ?? ''}
                        onChange={(v) => setCustomSplits((prev) => ({ ...prev, [id]: v }))}
                      />
                    </label>
                  );
                })}
              </div>
              <MatchBar
                label="Đã chia"
                current={totalCustom}
                total={amt}
                onAutoFix={() => setCustomSplits(splitEven(amt, orderedParticipants))}
              />
            </div>
          )}
        </section>

        {/* 5. Thời gian & ghi chú (thu gọn) */}
        <div>
          <button
            type="button"
            onClick={() => setShowMore(!showMore)}
            className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1 px-0.5"
          >
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showMore ? 'rotate-180' : ''}`} />
            Thời gian & ghi chú
          </button>
          {showMore && (
            <div className="grid grid-cols-2 gap-2 mt-1.5 animate-fade-in">
              <input
                type="datetime-local"
                aria-label="Thời gian"
                value={occurredAt}
                onChange={(e) => setOccurredAt(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-semibold focus:outline-none"
              />
              <input
                type="text"
                aria-label="Ghi chú"
                placeholder="Ghi chú"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-semibold focus:outline-none"
              />
            </div>
          )}
        </div>

        {/* Nút lưu */}
        <div className="pt-1 flex items-center space-x-2">
          <button
            type="button"
            onClick={onClose}
            className="w-24 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl text-xs transition active:scale-95"
          >
            Hủy
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 bg-slate-900 hover:bg-slate-800 text-white font-extrabold py-3 px-4 rounded-xl text-xs shadow-xs transition active:scale-95 disabled:opacity-50"
          >
            {isSubmitting ? 'Đang lưu...' : amt > 0 ? `Lưu chi tiêu (${formatVND(amt)})` : 'Lưu hoạt động'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
