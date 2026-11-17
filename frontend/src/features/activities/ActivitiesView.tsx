import React, { useState } from 'react';
import {
  Plus,
  Calendar,
  Receipt,
  Users,
  Search,
  ChevronRight,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import { formatVND, formatDateTime } from '../../utils/format.js';
import { Modal } from '../../components/common/Modal.js';
import { api } from '../../services/api.js';
import { toast } from 'sonner';

interface Member {
  id: string;
  name: string;
  status: string;
}

interface ActivitiesViewProps {
  groupCode: string;
  currentMemberId?: string | null;
  members: Member[];
  activities: any[];
  onRefresh: () => void;
  isOpenCreateModal: boolean;
  onCloseCreateModal: () => void;
}

export const ActivitiesView: React.FC<ActivitiesViewProps> = ({
  groupCode,
  currentMemberId,
  members,
  activities,
  onRefresh,
  isOpenCreateModal,
  onCloseCreateModal
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedActivity, setSelectedActivity] = useState<any | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);

  // Form state tạo/sửa hoạt động
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [occurredAt, setOccurredAt] = useState(new Date().toISOString().slice(0, 16));
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Expenses trong form
  const [expenseTitle, setExpenseTitle] = useState('');
  const [expenseAmount, setExpenseAmount] = useState<number | ''>('');
  const [payerId, setPayerId] = useState<string>(currentMemberId || members[0]?.id || '');
  const [splitType, setSplitType] = useState<'EQUAL' | 'EXACT'>('EQUAL');
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>(
    members.filter((m) => m.status === 'ACTIVE').map((m) => m.id)
  );
  const [customSplits, setCustomSplits] = useState<Record<string, number>>({});

  // Modal hủy/sửa
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const activeMembers = members.filter((m) => m.status === 'ACTIVE');

  // Lọc hoạt động
  const filteredActivities = activities.filter((act) =>
    act.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleOpenDetail = async (activityId: string) => {
    setIsDetailLoading(true);
    const res = await api.getActivityDetail(groupCode, activityId);
    setIsDetailLoading(false);
    if (res.success && res.data) {
      setSelectedActivity(res.data);
    } else {
      toast.error('Không thể tải chi tiết hoạt động');
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
        toast.error(`Tổng phân bổ (${totalCustom.toLocaleString('vi-VN')}đ) không khớp tổng tiền (${amt.toLocaleString('vi-VN')}đ)`);
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
          title: expenseTitle.trim() || title.trim(),
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
      setExpenseTitle('');
      setExpenseAmount('');
      onCloseCreateModal();
      onRefresh();
    } else {
      toast.error(res.error || 'Không thể tạo hoạt động');
    }
  };

  const handleCancelActivity = async () => {
    if (!cancelReason.trim()) {
      toast.error('Vui lòng nhập lý do hủy hoạt động');
      return;
    }
    if (!selectedActivity) return;

    setIsSubmitting(true);
    const res = await api.cancelActivity(groupCode, currentMemberId || 'anonymous', selectedActivity.id, cancelReason.trim());
    setIsSubmitting(false);

    if (res.success) {
      toast.success('Đã hủy hoạt động');
      setIsCancelModalOpen(false);
      setSelectedActivity(null);
      onRefresh();
    } else {
      toast.error(res.error || 'Không thể hủy hoạt động');
    }
  };

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

  return (
    <div className="space-y-4 pb-20">
      {/* Top search & add */}
      <div className="flex items-center space-x-2">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Tìm kiếm hoạt động..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-2xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
          />
        </div>
        <button
          onClick={onCloseCreateModal}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold p-2.5 rounded-2xl flex items-center justify-center transition shadow-sm active:scale-95"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>

      {/* Danh sách hoạt động */}
      {filteredActivities.length === 0 ? (
        <div className="bg-white p-8 rounded-3xl border border-slate-200 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
            <Receipt className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-bold text-slate-700">Chưa có hoạt động chi tiêu nào</h4>
          <p className="text-xs text-slate-400 max-w-xs mx-auto">
            Bấm nút dấu cộng bên trên để ghi nhận các khoản ăn uống, vé xe, tiền phòng,...
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredActivities.map((act) => {
            const isCancelled = act.status === 'CANCELLED';
            return (
              <div
                key={act.id}
                onClick={() => handleOpenDetail(act.id)}
                className={`bg-white p-4 rounded-3xl border cursor-pointer transition active:scale-[0.99] hover:border-slate-300 shadow-sm flex items-center justify-between ${
                  isCancelled ? 'opacity-60 border-slate-200 bg-slate-50' : 'border-slate-200/80'
                }`}
              >
                <div className="flex items-center space-x-3.5">
                  <div
                    className={`w-11 h-11 rounded-2xl flex items-center justify-center font-bold text-sm ${
                      isCancelled
                        ? 'bg-rose-50 text-rose-500'
                        : 'bg-emerald-50 text-emerald-600'
                    }`}
                  >
                    <Receipt className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <h4 className={`text-sm font-bold ${isCancelled ? 'line-through text-slate-500' : 'text-slate-900'}`}>
                        {act.title}
                      </h4>
                      {isCancelled && (
                        <span className="text-[10px] font-bold bg-rose-100 text-rose-600 px-2 py-0.5 rounded-full">
                          Đã hủy
                        </span>
                      )}
                    </div>
                    <div className="flex items-center space-x-2 text-xs text-slate-400 mt-0.5">
                      <span className="flex items-center space-x-1">
                        <Calendar className="w-3 h-3" />
                        <span>{formatDateTime(act.occurred_at)}</span>
                      </span>
                      <span>•</span>
                      <span>{act.expense_count} khoản</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <span className={`text-base font-extrabold ${isCancelled ? 'text-slate-400' : 'text-slate-900'}`}>
                    {formatVND(act.total_amount)}
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-300" />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal tạo hoạt động */}
      <Modal isOpen={isOpenCreateModal} onClose={onCloseCreateModal} title="Thêm hoạt động chi tiêu" maxWidth="lg">
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

      {/* Modal chi tiết hoạt động */}
      <Modal
        isOpen={Boolean(selectedActivity)}
        onClose={() => setSelectedActivity(null)}
        title={selectedActivity?.title || 'Chi tiết hoạt động'}
        maxWidth="lg"
      >
        {selectedActivity && (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <span className="text-xs text-slate-400">Thời gian diễn ra</span>
                <div className="text-sm font-semibold text-slate-800">
                  {formatDateTime(selectedActivity.occurred_at)}
                </div>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-400">Tổng chi phí</span>
                <div className="text-lg font-extrabold text-emerald-600">
                  {formatVND(selectedActivity.expenses?.reduce((a: number, b: any) => a + b.amount, 0))}
                </div>
              </div>
            </div>

            {/* Chi tiết từng khoản chi */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Các khoản chi & Người trả</h4>
              {selectedActivity.expenses?.map((exp: any) => (
                <div key={exp.id} className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-800">{exp.title}</span>
                    <span className="text-sm font-extrabold text-slate-900">{formatVND(exp.amount)}</span>
                  </div>

                  <div className="text-xs text-slate-600 flex items-center space-x-1">
                    <span className="text-slate-400">Người thanh toán:</span>
                    <span className="font-semibold text-emerald-700">
                      {exp.payers?.map((p: any) => `${p.member_name} (${formatVND(p.amount_paid)})`).join(', ')}
                    </span>
                  </div>

                  <div className="text-xs text-slate-600">
                    <span className="text-slate-400 block mb-1">Người chịu chi phí:</span>
                    <div className="grid grid-cols-2 gap-1.5">
                      {exp.splits?.map((s: any) => (
                        <div key={s.member_id} className="bg-white px-2 py-1 rounded-lg border border-slate-200 text-slate-700 flex justify-between">
                          <span>{s.member_name}</span>
                          <span className="font-bold">{formatVND(s.amount_owed)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Công nợ phát sinh */}
            {selectedActivity.obligations && selectedActivity.obligations.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Nghĩa vụ nợ gốc phát sinh</h4>
                <div className="space-y-1.5">
                  {selectedActivity.obligations.map((ob: any) => (
                    <div key={ob.id} className="text-xs bg-slate-50 p-2.5 rounded-xl flex items-center justify-between">
                      <div className="flex items-center space-x-1.5">
                        <span className="font-bold text-slate-800">{ob.debtor_name}</span>
                        <span className="text-slate-400">nợ</span>
                        <span className="font-bold text-slate-800">{ob.creditor_name}</span>
                      </div>
                      <span className="font-bold text-rose-500">{formatVND(ob.original_amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Nút hủy hoạt động */}
            {selectedActivity.status === 'ACTIVE' && (
              <div className="pt-3 border-t border-slate-100 flex justify-end">
                <button
                  onClick={() => setIsCancelModalOpen(true)}
                  className="text-xs font-bold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 px-4 py-2.5 rounded-xl transition flex items-center space-x-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Hủy hoạt động này</span>
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Modal xác nhận hủy hoạt động */}
      <Modal isOpen={isCancelModalOpen} onClose={() => setIsCancelModalOpen(false)} title="Xác nhận hủy hoạt động">
        <div className="space-y-3">
          <div className="bg-amber-50 p-3 rounded-2xl border border-amber-200 text-xs text-amber-800 flex items-start space-x-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <span>
              Hủy hoạt động sẽ hủy bỏ toàn bộ các khoản nợ chưa thanh toán. Nếu đã có người chuyển tiền xác nhận, hệ thống sẽ tạo khoản điều chỉnh để giữ tính toàn vẹn tài chính.
            </span>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Lý do hủy (bắt buộc) *
            </label>
            <input
              type="text"
              placeholder="Ví dụ: Nhập nhầm số tiền, Hủy bữa tiệc..."
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-rose-500"
            />
          </div>

          <div className="flex space-x-2 pt-2">
            <button
              onClick={() => setIsCancelModalOpen(false)}
              className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl text-xs transition"
            >
              Quay lại
            </button>
            <button
              onClick={handleCancelActivity}
              disabled={isSubmitting || !cancelReason.trim()}
              className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold py-2.5 rounded-xl text-xs transition disabled:opacity-50"
            >
              {isSubmitting ? 'Đang xử lý...' : 'Xác nhận hủy'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
