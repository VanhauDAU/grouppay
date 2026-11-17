import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  Users,
  User,
  ChevronDown,
  ChevronUp,
  Calendar,
  FileText,
  Check,
  Plus
} from 'lucide-react';
import { Modal } from '../../components/common/Modal.js';
import { api } from '../../services/api.js';
import { toast } from 'sonner';
import { formatVND, getInitials } from '../../utils/format.js';
import { getMemberTheme } from '../../utils/theme.js';

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

export const CreateActivityModal: React.FC<CreateActivityModalProps> = ({
  isOpen,
  onClose,
  groupCode,
  currentMemberId,
  members,
  onSuccess
}) => {
  const activeMembers = members.filter((m) => m.status === 'ACTIVE');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [occurredAt, setOccurredAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [expenseAmount, setExpenseAmount] = useState<number | ''>('');

  // Payer configuration
  const [payerMode, setPayerMode] = useState<'SINGLE' | 'MULTIPLE'>('SINGLE');
  const [singlePayerId, setSinglePayerId] = useState<string>('');
  const [multiplePayers, setMultiplePayers] = useState<Record<string, number | ''>>({});

  // Split configuration
  const [splitType, setSplitType] = useState<'EQUAL' | 'EXACT'>('EQUAL');
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  const [customSplits, setCustomSplits] = useState<Record<string, number | ''>>({});

  // Mobile UX: Toggle Tùy chọn nâng cao
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen && activeMembers.length > 0) {
      setSelectedParticipants(activeMembers.map((m) => m.id));
      if (!singlePayerId) {
        setSinglePayerId(currentMemberId || activeMembers[0].id);
      }
    }
  }, [isOpen, members, currentMemberId]);

  const toggleParticipant = (memberId: string) => {
    if (selectedParticipants.includes(memberId)) {
      if (selectedParticipants.length <= 1) {
        toast.error('Phải có ít nhất 1 người chịu chi phí');
        return;
      }
      setSelectedParticipants(selectedParticipants.filter((id) => id !== memberId));
    } else {
      setSelectedParticipants([...selectedParticipants, memberId]);
    }
  };

  const toggleSelectAllParticipants = () => {
    if (selectedParticipants.length === activeMembers.length) {
      // Giữ lại người trả tiền hoặc người đầu tiên
      const keepId = singlePayerId || activeMembers[0]?.id;
      setSelectedParticipants(keepId ? [keepId] : []);
    } else {
      setSelectedParticipants(activeMembers.map((m) => m.id));
    }
  };

  // Quick amount buttons
  const addQuickAmount = (delta: number) => {
    const current = Number(expenseAmount) || 0;
    setExpenseAmount(current + delta);
  };

  // Helper chia đều người trả
  const handleSplitPayersEqually = () => {
    const amt = Number(expenseAmount);
    if (!amt || amt <= 0) {
      toast.error('Vui lòng nhập số tiền chi tiêu trước');
      return;
    }
    const count = activeMembers.length;
    if (count === 0) return;
    const base = Math.floor(amt / count);
    const remainder = amt % count;
    const newPayers: Record<string, number> = {};
    activeMembers.forEach((m, idx) => {
      newPayers[m.id] = base + (idx < remainder ? 1 : 0);
    });
    setMultiplePayers(newPayers);
  };

  const totalPaidInMultiple = Object.values(multiplePayers).reduce<number>(
    (acc, val) => acc + (Number(val) || 0),
    0
  );

  // Helper chia đều người chịu chi phí trong chế độ EXACT
  const handleSplitParticipantsEqually = () => {
    const amt = Number(expenseAmount);
    if (!amt || amt <= 0) {
      toast.error('Vui lòng nhập số tiền chi tiêu trước');
      return;
    }
    const count = selectedParticipants.length;
    if (count === 0) return;
    const base = Math.floor(amt / count);
    const remainder = amt % count;
    const newSplits: Record<string, number> = {};
    selectedParticipants.forEach((mId, idx) => {
      newSplits[mId] = base + (idx < remainder ? 1 : 0);
    });
    setCustomSplits(newSplits);
  };

  const totalCustomSplits = Object.values(customSplits).reduce<number>(
    (acc, val) => acc + (Number(val) || 0),
    0
  );

  const amtNum = Number(expenseAmount) || 0;
  const perPersonEstimated =
    selectedParticipants.length > 0 && amtNum > 0
      ? Math.round(amtNum / selectedParticipants.length)
      : 0;

  const handleCreateActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error('Vui lòng nhập tên hoạt động');
      return;
    }
    const amt = Number(expenseAmount);
    if (!amt || amt <= 0) {
      toast.error('Vui lòng nhập số tiền chi tiêu hợp lệ');
      return;
    }
    if (selectedParticipants.length === 0) {
      toast.error('Vui lòng chọn ít nhất 1 người chịu chi phí');
      return;
    }

    // Xác thực danh sách người thanh toán
    let payersPayload: { memberId: string; amountPaid: number }[] = [];
    if (payerMode === 'SINGLE') {
      if (!singlePayerId) {
        toast.error('Vui lòng chọn người trả tiền');
        return;
      }
      payersPayload = [{ memberId: singlePayerId, amountPaid: amt }];
    } else {
      const activePayers = Object.entries(multiplePayers)
        .filter(([_, amount]) => Number(amount) > 0)
        .map(([memberId, amount]) => ({
          memberId,
          amountPaid: Number(amount)
        }));

      if (activePayers.length === 0) {
        toast.error('Vui lòng nhập số tiền do ít nhất 1 người trả');
        return;
      }

      const totalPaid = activePayers.reduce((acc, p) => acc + p.amountPaid, 0);
      if (totalPaid !== amt) {
        toast.error(
          `Tổng tiền người trả (${totalPaid.toLocaleString('vi-VN')}đ) không khớp tổng chi phí (${amt.toLocaleString('vi-VN')}đ). Lệch: ${(amt - totalPaid).toLocaleString('vi-VN')}đ`
        );
        return;
      }
      payersPayload = activePayers;
    }

    // Xác thực phân bổ chi phí
    let payloadCustomSplits = undefined;
    if (splitType === 'EXACT') {
      const totalCustom = selectedParticipants.reduce(
        (sum, mId) => sum + (Number(customSplits[mId]) || 0),
        0
      );
      if (totalCustom !== amt) {
        toast.error(
          `Tổng phân bổ (${totalCustom.toLocaleString('vi-VN')}đ) không khớp tổng tiền (${amt.toLocaleString('vi-VN')}đ)`
        );
        return;
      }
      payloadCustomSplits = selectedParticipants.map((mId) => ({
        memberId: mId,
        amountOwed: Number(customSplits[mId]) || 0
      }));
    }

    setIsSubmitting(true);
    const creatorId = currentMemberId || payersPayload[0].memberId;
    const res = await api.createActivity(groupCode, creatorId, {
      title: title.trim(),
      description: description.trim() || undefined,
      occurredAt,
      expenses: [
        {
          title: title.trim(),
          amount: amt,
          splitType,
          payers: payersPayload,
          participants: selectedParticipants,
          customSplits: payloadCustomSplits
        }
      ]
    });
    setIsSubmitting(false);

    if (res.success) {
      toast.success('Tạo hoạt động thành công!');
      // Reset form
      setTitle('');
      setDescription('');
      setExpenseAmount('');
      setMultiplePayers({});
      setCustomSplits({});
      setShowAdvanced(false);
      onSuccess();
      onClose();
    } else {
      toast.error(res.error || 'Không thể tạo hoạt động');
    }
  };

  const currentPayerMember = activeMembers.find((m) => m.id === singlePayerId);
  const currentPayerTheme = getMemberTheme(currentPayerMember);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Thêm hoạt động chi tiêu" maxWidth="md">
      <form onSubmit={handleCreateActivity} className="space-y-3.5">
        {/* 1. Ô nhập tiền lớn, phong cách Mobile Banking */}
        <div className="bg-slate-50/80 p-3.5 rounded-2xl border border-slate-200/90 text-center">
          <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
            Số tiền chi tiêu (VND) *
          </label>
          <div className="flex items-center justify-center">
            <input
              type="number"
              inputMode="numeric"
              placeholder="0"
              value={expenseAmount}
              onChange={(e) => setExpenseAmount(e.target.value ? Number(e.target.value) : '')}
              className="w-full text-center text-3xl font-black text-slate-900 bg-transparent border-none focus:outline-none placeholder-slate-300 tracking-tight"
              required
              autoFocus
            />
          </div>

          {/* Nút bấm nhanh số tiền phổ biến */}
          <div className="flex items-center justify-center space-x-1.5 mt-2.5 pt-2 border-t border-slate-200/60">
            <button
              type="button"
              onClick={() => addQuickAmount(50000)}
              className="text-[11px] font-bold text-slate-600 bg-white hover:bg-slate-100 border border-slate-200/80 px-2.5 py-1 rounded-lg transition active:scale-95"
            >
              +50k
            </button>
            <button
              type="button"
              onClick={() => addQuickAmount(100000)}
              className="text-[11px] font-bold text-slate-600 bg-white hover:bg-slate-100 border border-slate-200/80 px-2.5 py-1 rounded-lg transition active:scale-95"
            >
              +100k
            </button>
            <button
              type="button"
              onClick={() => addQuickAmount(200000)}
              className="text-[11px] font-bold text-slate-600 bg-white hover:bg-slate-100 border border-slate-200/80 px-2.5 py-1 rounded-lg transition active:scale-95"
            >
              +200k
            </button>
            <button
              type="button"
              onClick={() => addQuickAmount(500000)}
              className="text-[11px] font-bold text-slate-600 bg-white hover:bg-slate-100 border border-slate-200/80 px-2.5 py-1 rounded-lg transition active:scale-95"
            >
              +500k
            </button>
            {amtNum > 0 && (
              <button
                type="button"
                onClick={() => setExpenseAmount('')}
                className="text-[11px] font-bold text-rose-500 bg-white hover:bg-rose-50 border border-rose-200 px-2 py-1 rounded-lg transition active:scale-95"
              >
                Xóa
              </button>
            )}
          </div>
        </div>

        {/* 2. Tên hoạt động */}
        <div>
          <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
            Tên hoạt động *
          </label>
          <input
            type="text"
            placeholder="Ví dụ: Ăn trưa bún bò, Cà phê, Tiền phòng..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-slate-800 transition"
            required
          />
        </div>

        {/* 3. Người đứng ra trả tiền (Gọn gàng) */}
        {payerMode === 'SINGLE' && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                Người trả tiền
              </label>
              <button
                type="button"
                onClick={() => {
                  setPayerMode('MULTIPLE');
                  setShowAdvanced(true);
                }}
                className="text-[11px] text-slate-500 hover:text-slate-800 font-semibold"
              >
                Nhiều người cùng trả?
              </button>
            </div>

            <div className="relative">
              <select
                value={singlePayerId}
                onChange={(e) => setSinglePayerId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-800 appearance-none transition"
              >
                {activeMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} {m.id === currentMemberId ? '(Bạn đã trả)' : ''}
                  </option>
                ))}
              </select>
              <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                <ChevronDown className="w-4 h-4" />
              </div>
            </div>
          </div>
        )}

        {/* 4. Những ai cùng chịu tiền (Chips gọn gàng trên mobile) */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
              Chia cho ({selectedParticipants.length}/{activeMembers.length} người)
            </label>
            <button
              type="button"
              onClick={toggleSelectAllParticipants}
              className="text-[11px] font-bold text-slate-600 hover:text-slate-900 bg-slate-100 px-2 py-0.5 rounded-lg"
            >
              {selectedParticipants.length === activeMembers.length ? 'Bỏ chọn hết' : 'Chọn tất cả'}
            </button>
          </div>

          {/* Dạng chip ngang bo tròn, chạm 1 chạm để bật/tắt */}
          <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-1 bg-slate-50/70 border border-slate-200/80 rounded-2xl">
            {activeMembers.map((m) => {
              const isChecked = selectedParticipants.includes(m.id);
              const mTheme = getMemberTheme(m);
              return (
                <button
                  type="button"
                  key={m.id}
                  onClick={() => toggleParticipant(m.id)}
                  className={`px-2.5 py-1 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition active:scale-95 ${
                    isChecked
                      ? 'bg-slate-900 text-white shadow-2xs'
                      : 'bg-white text-slate-500 border border-slate-200/80 hover:bg-slate-100'
                  }`}
                >
                  <div
                    className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold"
                    style={{ backgroundColor: isChecked ? 'rgba(255,255,255,0.2)' : mTheme.hex, color: '#fff' }}
                  >
                    {getInitials(m.name)}
                  </div>
                  <span>{m.name}</span>
                  {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                </button>
              );
            })}
          </div>

          {/* Dự kiến chia mỗi người */}
          {amtNum > 0 && selectedParticipants.length > 0 && splitType === 'EQUAL' && (
            <div className="text-[11px] text-slate-500 mt-1.5 flex items-center justify-between px-1">
              <span>Mỗi người chịu:</span>
              <span className="font-bold text-slate-800">~{formatVND(perPersonEstimated)}</span>
            </div>
          )}
        </div>

        {/* 5. Tùy chọn nâng cao (Collapsible Progressive Disclosure) */}
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full py-2 px-3 bg-slate-100/70 hover:bg-slate-100 rounded-xl text-xs font-semibold text-slate-600 flex items-center justify-between transition"
          >
            <span>Tùy chọn nâng cao (Nhiều người trả, chia số tiền riêng, giờ, ghi chú)</span>
            {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showAdvanced && (
            <div className="mt-2.5 p-3 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-3 transition">
              {/* Chế độ người trả */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Hình thức thanh toán
                </label>
                <div className="flex bg-slate-200/70 p-1 rounded-xl text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setPayerMode('SINGLE')}
                    className={`flex-1 py-1 rounded-lg transition ${
                      payerMode === 'SINGLE' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500'
                    }`}
                  >
                    1 người trả
                  </button>
                  <button
                    type="button"
                    onClick={() => setPayerMode('MULTIPLE')}
                    className={`flex-1 py-1 rounded-lg transition ${
                      payerMode === 'MULTIPLE' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500'
                    }`}
                  >
                    Nhiều người cùng trả
                  </button>
                </div>

                {payerMode === 'MULTIPLE' && (
                  <div className="mt-2 space-y-2 bg-white p-2.5 rounded-xl border border-slate-200">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-500">Số tiền từng người đã bỏ ra:</span>
                      <button
                        type="button"
                        onClick={handleSplitPayersEqually}
                        className="text-[10px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-lg"
                      >
                        Chia đều tiền trả
                      </button>
                    </div>

                    <div className="space-y-1.5 max-h-36 overflow-y-auto">
                      {activeMembers.map((m) => (
                        <div key={m.id} className="flex items-center justify-between text-xs space-x-2">
                          <span className="font-semibold text-slate-700 truncate w-32">{m.name}</span>
                          <input
                            type="number"
                            placeholder="0"
                            value={multiplePayers[m.id] ?? ''}
                            onChange={(e) =>
                              setMultiplePayers({
                                ...multiplePayers,
                                [m.id]: e.target.value ? Number(e.target.value) : ''
                              })
                            }
                            className="w-28 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-right font-bold text-xs"
                          />
                        </div>
                      ))}
                    </div>

                    <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between text-[11px]">
                      <span className="text-slate-500">
                        Đã nhập: <b>{formatVND(totalPaidInMultiple)}</b> / {formatVND(amtNum)}
                      </span>
                      {amtNum > 0 && totalPaidInMultiple === amtNum ? (
                        <span className="text-emerald-600 font-bold">Khớp 100%</span>
                      ) : amtNum > 0 ? (
                        <span className="text-rose-500 font-bold">
                          {amtNum > totalPaidInMultiple
                            ? `Thiếu ${formatVND(amtNum - totalPaidInMultiple)}`
                            : `Thừa ${formatVND(totalPaidInMultiple - amtNum)}`}
                        </span>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>

              {/* Chế độ chia: Chia đều / Nhập số tiền riêng */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Cách phân bổ chi phí
                </label>
                <div className="flex bg-slate-200/70 p-1 rounded-xl text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setSplitType('EQUAL')}
                    className={`flex-1 py-1 rounded-lg transition ${
                      splitType === 'EQUAL' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500'
                    }`}
                  >
                    Chia đều
                  </button>
                  <button
                    type="button"
                    onClick={() => setSplitType('EXACT')}
                    className={`flex-1 py-1 rounded-lg transition ${
                      splitType === 'EXACT' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500'
                    }`}
                  >
                    Nhập số tiền riêng
                  </button>
                </div>

                {splitType === 'EXACT' && (
                  <div className="mt-2 space-y-2 bg-white p-2.5 rounded-xl border border-slate-200">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-500">Tiền từng người phải chịu:</span>
                      <button
                        type="button"
                        onClick={handleSplitParticipantsEqually}
                        className="text-[10px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-lg"
                      >
                        Chia đều cho người chọn
                      </button>
                    </div>

                    <div className="space-y-1.5 max-h-36 overflow-y-auto">
                      {selectedParticipants.map((mId) => {
                        const m = activeMembers.find((item) => item.id === mId);
                        if (!m) return null;
                        return (
                          <div key={mId} className="flex items-center justify-between text-xs space-x-2">
                            <span className="font-semibold text-slate-700 truncate w-32">{m.name}</span>
                            <input
                              type="number"
                              placeholder="0"
                              value={customSplits[mId] ?? ''}
                              onChange={(e) =>
                                setCustomSplits({
                                  ...customSplits,
                                  [mId]: e.target.value ? Number(e.target.value) : ''
                                })
                              }
                              className="w-28 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-right font-bold text-xs"
                            />
                          </div>
                        );
                      })}
                    </div>

                    <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between text-[11px]">
                      <span className="text-slate-500">
                        Đã chia: <b>{formatVND(totalCustomSplits)}</b> / {formatVND(amtNum)}
                      </span>
                      {amtNum > 0 && totalCustomSplits === amtNum ? (
                        <span className="text-emerald-600 font-bold">Khớp 100%</span>
                      ) : amtNum > 0 ? (
                        <span className="text-rose-500 font-bold">
                          {amtNum > totalCustomSplits
                            ? `Thiếu ${formatVND(amtNum - totalCustomSplits)}`
                            : `Thừa ${formatVND(totalCustomSplits - amtNum)}`}
                        </span>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>

              {/* Thời gian diễn ra & Ghi chú */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Thời gian
                  </label>
                  <input
                    type="datetime-local"
                    value={occurredAt}
                    onChange={(e) => setOccurredAt(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-semibold focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Ghi chú
                  </label>
                  <input
                    type="text"
                    placeholder="Khăn ướt, VAT..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-semibold focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Nút lưu hoạt động (To, dễ bấm trên mobile) */}
        <div className="pt-2 flex items-center space-x-2">
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
            {isSubmitting
              ? 'Đang lưu...'
              : amtNum > 0
              ? `Lưu chi tiêu (${formatVND(amtNum)})`
              : 'Lưu hoạt động'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
