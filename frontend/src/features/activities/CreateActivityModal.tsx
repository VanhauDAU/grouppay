import React, { useState, useEffect } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Modal } from '../../components/common/Modal.js';
import { api } from '../../services/api.js';
import { toast } from 'sonner';

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
  const [payerId, setPayerId] = useState<string>(currentMemberId || activeMembers[0]?.id || '');
  const [splitType, setSplitType] = useState<'EQUAL' | 'EXACT'>('EQUAL');
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  const [customSplits, setCustomSplits] = useState<Record<string, number>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (activeMembers.length > 0) {
        setSelectedParticipants(activeMembers.map((m) => m.id));
        if (!payerId) {
          setPayerId(currentMemberId || activeMembers[0].id);
        }
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

    let payloadCustomSplits = undefined;
    if (splitType === 'EXACT') {
      const totalCustom = Object.values(customSplits).reduce((a, b) => a + (Number(b) || 0), 0);
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
    const res = await api.createActivity(groupCode, currentMemberId || payerId, {
      title: title.trim(),
      description: description.trim() || undefined,
      occurredAt,
      expenses: [
        {
          title: title.trim(),
          amount: amt,
          splitType,
          payers: [{ memberId: payerId, amountPaid: amt }],
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
      onSuccess();
      onClose();
    } else {
      toast.error(res.error || 'Không thể tạo hoạt động');
    }
  };

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

        <div className="grid grid-cols-2 gap-3">
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
              Người trả tiền *
            </label>
            <select
              value={payerId}
              onChange={(e) => setPayerId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
            >
              {activeMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Thời gian diễn ra
          </label>
          <input
            type="datetime-local"
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
          />
        </div>

        {/* Cách phân bổ */}
        <div className="pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between mb-3">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Phân bổ chi phí
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
              <div className="pt-2 space-y-2">
                <span className="text-xs font-bold text-slate-700 block">Nhập số tiền chịu chi phí từng người:</span>
                {selectedParticipants.map((mId) => {
                  const m = members.find((x) => x.id === mId);
                  return (
                    <div key={mId} className="flex items-center space-x-2">
                      <span className="text-xs font-semibold text-slate-700 w-28 truncate">{m?.name}:</span>
                      <input
                        type="number"
                        placeholder="Số tiền (VND)"
                        value={customSplits[mId] || ''}
                        onChange={(e) =>
                          setCustomSplits({
                            ...customSplits,
                            [mId]: Number(e.target.value) || 0
                          })
                        }
                        className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="pt-3">
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-2xl shadow-lg shadow-emerald-600/25 transition active:scale-[0.98] disabled:opacity-50"
          >
            {isSubmitting ? 'Đang lưu...' : 'Lưu hoạt động và tính công nợ'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
