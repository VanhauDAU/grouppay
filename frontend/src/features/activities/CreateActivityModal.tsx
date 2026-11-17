import React, { useState, useEffect } from 'react';
import { CheckCircle2, AlertCircle, Users, User } from 'lucide-react';
import { Modal } from '../../components/common/Modal.js';
import { api } from '../../services/api.js';
import { toast } from 'sonner';
import { formatVND } from '../../utils/format.js';

interface Member {
  id: string;
  name: string;
  status: string;
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

  // Tính tổng tiền người trả hiện tại trong chế độ MULTIPLE
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
      onSuccess();
      onClose();
    } else {
      toast.error(res.error || 'Không thể tạo hoạt động');
    }
  };

  const amtNum = Number(expenseAmount) || 0;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Thêm hoạt động chi tiêu" maxWidth="lg">
      <form onSubmit={handleCreateActivity} className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Tên hoạt động *
          </label>
          <input
            type="text"
            placeholder="Ví dụ: Ăn tối lẩu bò, Vé tham quan..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
            required
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Số tiền chi (VND) *
            </label>
            <input
              type="number"
              placeholder="Ví dụ: 600000"
              value={expenseAmount}
              onChange={(e) => setExpenseAmount(e.target.value ? Number(e.target.value) : '')}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Thời gian diễn ra
            </label>
            <input
              type="datetime-local"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
            />
          </div>
        </div>

        {/* Cấu hình người thanh toán */}
        <div className="pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center space-x-1.5">
              <span>Người đứng ra thanh toán *</span>
            </label>
            <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-bold">
              <button
                type="button"
                onClick={() => setPayerMode('SINGLE')}
                className={`px-3 py-1 rounded-lg transition flex items-center space-x-1 ${
                  payerMode === 'SINGLE' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-500'
                }`}
              >
                <User className="w-3.5 h-3.5" />
                <span>1 người trả</span>
              </button>
              <button
                type="button"
                onClick={() => setPayerMode('MULTIPLE')}
                className={`px-3 py-1 rounded-lg transition flex items-center space-x-1 ${
                  payerMode === 'MULTIPLE' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-500'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Nhiều người cùng trả</span>
              </button>
            </div>
          </div>

          {payerMode === 'SINGLE' ? (
            <div>
              <select
                value={singlePayerId}
                onChange={(e) => setSinglePayerId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
              >
                {activeMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} {m.id === currentMemberId ? '(Bạn)' : ''}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">Nhập số tiền từng người đã thanh toán:</span>
                <button
                  type="button"
                  onClick={handleSplitPayersEqually}
                  className="text-xs font-bold text-emerald-600 hover:text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg transition"
                >
                  Chia đều tiền trả
                </button>
              </div>

              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {activeMembers.map((m) => (
                  <div key={m.id} className="flex items-center justify-between text-xs space-x-2">
                    <span className="font-semibold text-slate-700 truncate w-36">
                      {m.name} {m.id === currentMemberId ? '(Bạn)' : ''}
                    </span>
                    <div className="relative flex-1 max-w-[180px]">
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
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-right font-bold text-xs focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Dòng tóm tắt tiền trả */}
              <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-xs">
                <span className="text-slate-500">
                  Đã nhập:{' '}
                  <span className="font-bold text-slate-800">{formatVND(totalPaidInMultiple)}</span> /{' '}
                  <span className="font-bold text-slate-600">{formatVND(amtNum)}</span>
                </span>
                {amtNum > 0 && totalPaidInMultiple === amtNum ? (
                  <span className="text-emerald-600 font-bold flex items-center space-x-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Khớp 100%</span>
                  </span>
                ) : amtNum > 0 ? (
                  <span className="text-rose-500 font-bold flex items-center space-x-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>
                      {amtNum > totalPaidInMultiple
                        ? `Còn thiếu ${formatVND(amtNum - totalPaidInMultiple)}`
                        : `Thừa ${formatVND(totalPaidInMultiple - amtNum)}`}
                    </span>
                  </span>
                ) : null}
              </div>
            </div>
          )}
        </div>

        {/* Cách phân bổ chi phí */}
        <div className="pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between mb-3">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Người chịu chi phí
            </label>
            <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-bold">
              <button
                type="button"
                onClick={() => setSplitType('EQUAL')}
                className={`px-3 py-1 rounded-lg transition ${
                  splitType === 'EQUAL' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-500'
                }`}
              >
                Chia đều
              </button>
              <button
                type="button"
                onClick={() => setSplitType('EXACT')}
                className={`px-3 py-1 rounded-lg transition ${
                  splitType === 'EXACT' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-500'
                }`}
              >
                Nhập số tiền riêng
              </button>
            </div>
          </div>

          {/* Danh sách người tham gia */}
          <div className="space-y-2">
            <span className="text-xs text-slate-400">Chọn những ai cùng tham gia chia tiền:</span>
            <div className="grid grid-cols-2 gap-2">
              {activeMembers.map((m) => {
                const isChecked = selectedParticipants.includes(m.id);
                return (
                  <div
                    key={m.id}
                    onClick={() => toggleParticipant(m.id)}
                    className={`p-2.5 rounded-xl border cursor-pointer flex items-center justify-between text-xs transition ${
                      isChecked
                        ? 'border-emerald-500 bg-emerald-50/70 font-bold text-emerald-900'
                        : 'border-slate-200 text-slate-600 bg-white'
                    }`}
                  >
                    <span>{m.name}</span>
                    {isChecked && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                  </div>
                );
              })}
            </div>

            {splitType === 'EXACT' && (
              <div className="pt-2 space-y-2 bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-slate-500">Số tiền từng người phải chịu:</span>
                  <button
                    type="button"
                    onClick={handleSplitParticipantsEqually}
                    className="text-xs font-bold text-emerald-600 hover:text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg"
                  >
                    Chia đều cho người chọn
                  </button>
                </div>
                {selectedParticipants.map((mId) => {
                  const m = activeMembers.find((item) => item.id === mId);
                  if (!m) return null;
                  return (
                    <div key={mId} className="flex items-center justify-between text-xs space-x-2">
                      <span className="font-semibold text-slate-700 truncate w-36">{m.name}</span>
                      <div className="relative flex-1 max-w-[180px]">
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
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-right font-bold text-xs focus:ring-1 focus:ring-emerald-500"
                        />
                      </div>
                    </div>
                  );
                })}

                <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-xs">
                  <span className="text-slate-500">
                    Đã chia: <span className="font-bold text-slate-800">{formatVND(totalCustomSplits)}</span> /{' '}
                    <span className="font-bold text-slate-600">{formatVND(amtNum)}</span>
                  </span>
                  {amtNum > 0 && totalCustomSplits === amtNum ? (
                    <span className="text-emerald-600 font-bold flex items-center space-x-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Khớp 100%</span>
                    </span>
                  ) : amtNum > 0 ? (
                    <span className="text-rose-500 font-bold flex items-center space-x-1">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>
                        {amtNum > totalCustomSplits
                          ? `Còn thiếu ${formatVND(amtNum - totalCustomSplits)}`
                          : `Thừa ${formatVND(totalCustomSplits - amtNum)}`}
                      </span>
                    </span>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Ghi chú (Tùy chọn)
          </label>
          <input
            type="text"
            placeholder="Ví dụ: Đã bao gồm 10% VAT và khăn ướt..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
          />
        </div>

        <div className="pt-4 flex items-center space-x-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 px-4 rounded-2xl text-xs transition"
          >
            Hủy
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-4 rounded-2xl text-xs shadow-lg shadow-emerald-600/20 transition disabled:opacity-50"
          >
            {isSubmitting ? 'Đang lưu...' : 'Lưu hoạt động'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
