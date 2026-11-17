import React, { useState } from 'react';
import { History, Search, Calendar, User, Filter } from 'lucide-react';
import { formatDateTime } from '../../utils/format.js';

interface HistoryItem {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  actorName: string;
  metadata?: any;
  createdAt: string;
}

interface HistoryViewProps {
  history: HistoryItem[];
  onSearch: (filters: { q?: string; memberId?: string; fromDate?: string; toDate?: string }) => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({ history, onSearch }) => {
  const [searchTerm, setSearchTerm] = useState('');

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch({ q: searchTerm.trim() || undefined });
  };

  const getActionLabel = (action: string) => {
    switch (action) {
      case 'ACTIVITY_CREATED':
        return { label: 'Tạo hoạt động mới', color: 'text-emerald-700 bg-emerald-50' };
      case 'ACTIVITY_UPDATED':
        return { label: 'Chỉnh sửa hoạt động', color: 'text-blue-700 bg-blue-50' };
      case 'ACTIVITY_CANCELLED':
        return { label: 'Hủy hoạt động', color: 'text-rose-700 bg-rose-50' };
      case 'PAYMENT_SUBMITTED':
        return { label: 'Báo đã chuyển tiền', color: 'text-amber-700 bg-amber-50' };
      case 'PAYMENT_CONFIRMED':
        return { label: 'Xác nhận thanh toán', color: 'text-emerald-700 bg-emerald-50' };
      case 'PAYMENT_REJECTED':
        return { label: 'Từ chối thanh toán', color: 'text-rose-700 bg-rose-50' };
      case 'PAYMENT_CANCELLED':
        return { label: 'Hủy yêu cầu thanh toán', color: 'text-slate-700 bg-slate-100' };
      case 'MEMBER_ADDED':
        return { label: 'Thêm thành viên', color: 'text-indigo-700 bg-indigo-50' };
      case 'MEMBER_UPDATED':
        return { label: 'Cập nhật thành viên', color: 'text-slate-700 bg-slate-100' };
      case 'INITIAL_DEBTS_IMPORTED':
        return { label: 'Nhập công nợ ban đầu', color: 'text-purple-700 bg-purple-50' };
      default:
        return { label: action, color: 'text-slate-700 bg-slate-100' };
    }
  };

  return (
    <div className="space-y-4 pb-20">
      {/* Search Bar */}
      <form onSubmit={handleSearchSubmit} className="flex space-x-2">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Tìm kiếm lịch sử thao tác..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-2xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-emerald-500 transition"
          />
        </div>
        <button
          type="submit"
          className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-4 py-2.5 rounded-2xl text-xs transition"
        >
          Lọc
        </button>
      </form>

      {/* History Timeline */}
      {history.length === 0 ? (
        <div className="bg-white p-8 rounded-3xl border border-slate-200 text-center space-y-2">
          <History className="w-10 h-10 text-slate-300 mx-auto" />
          <h4 className="text-sm font-bold text-slate-700">Chưa có bản ghi lịch sử nào</h4>
          <p className="text-xs text-slate-400">Mọi thao tác tài chính và thay đổi sẽ được lưu vết tại đây.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {history.map((item) => {
            const badge = getActionLabel(item.action);
            return (
              <div
                key={item.id}
                className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-xs space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${badge.color}`}>
                    {badge.label}
                  </span>
                  <span className="text-xs text-slate-400">{formatDateTime(item.createdAt)}</span>
                </div>

                <div className="text-xs text-slate-700 font-medium">
                  Người thực hiện: <span className="font-bold text-slate-900">{item.actorName}</span>
                </div>

                {item.metadata && (
                  <div className="text-xs text-slate-500 bg-slate-50 p-2.5 rounded-xl border border-slate-100 font-mono mt-1">
                    {item.metadata.reason && <div>Lý do: {item.metadata.reason}</div>}
                    {item.metadata.title && <div>Hoạt động: {item.metadata.title}</div>}
                    {item.metadata.amount && <div>Số tiền: {item.metadata.amount.toLocaleString('vi-VN')} đ</div>}
                    {item.metadata.count && <div>Số lượng: {item.metadata.count} mục</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
