import React, { useState } from 'react';
import {
  Plus,
  Calendar,
  Receipt,
  Search,
  ChevronRight,
  Trash2,
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
  onOpenCreateModal: () => void;
}

export const ActivitiesView: React.FC<ActivitiesViewProps> = ({
  groupCode,
  currentMemberId,
  activities,
  onRefresh,
  onOpenCreateModal
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedActivity, setSelectedActivity] = useState<any | null>(null);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Lọc hoạt động
  const filteredActivities = activities.filter((act) =>
    act.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleOpenDetail = async (activityId: string) => {
    const res = await api.getActivityDetail(groupCode, activityId);
    if (res.success && res.data) {
      setSelectedActivity(res.data);
    } else {
      toast.error('Không thể tải chi tiết hoạt động');
    }
  };

  const handleCancelActivity = async () => {
    if (!cancelReason.trim()) {
      toast.error('Vui lòng nhập lý do hủy hoạt động');
      return;
    }
    if (!selectedActivity) return;

    setIsSubmitting(true);
    const res = await api.cancelActivity(
      groupCode,
      currentMemberId || 'anonymous',
      selectedActivity.id,
      cancelReason.trim()
    );
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
          onClick={onOpenCreateModal}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold p-2.5 rounded-2xl flex items-center justify-center transition shadow-sm active:scale-95"
          title="Thêm hoạt động chi tiêu"
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
          <button
            onClick={onOpenCreateModal}
            className="inline-flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition"
          >
            <Plus className="w-4 h-4" />
            <span>Thêm hoạt động đầu tiên</span>
          </button>
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
