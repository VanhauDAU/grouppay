import React from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { Modal } from '../../components/common/Modal.js';
import { formatDateTime } from '../../utils/format.js';
import { api } from '../../services/api.js';
import { toast } from 'sonner';

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

interface NotificationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupCode: string;
  currentMemberId?: string | null;
  notifications: NotificationItem[];
  onRefresh: () => void;
}

export const NotificationsModal: React.FC<NotificationsModalProps> = ({
  isOpen,
  onClose,
  groupCode,
  currentMemberId,
  notifications,
  onRefresh
}) => {
  const handleMarkAllRead = async () => {
    const res = await api.markAllNotificationsRead(groupCode, currentMemberId || undefined);
    if (res.success) {
      toast.success('Đã đánh dấu đã đọc');
      onRefresh();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Thông báo nhóm">
      <div className="space-y-3">
        {notifications.length > 0 && (
          <div className="flex justify-end pb-1">
            <button
              onClick={handleMarkAllRead}
              className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center space-x-1"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span>Đánh dấu đã đọc tất cả</span>
            </button>
          </div>
        )}

        {notifications.length === 0 ? (
          <div className="py-8 text-center text-slate-400 space-y-2">
            <Bell className="w-8 h-8 mx-auto opacity-40" />
            <p className="text-xs">Không có thông báo mới</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto no-scrollbar">
            {notifications.map((n) => (
              <div
                key={n.id}
                className={`p-3.5 rounded-2xl border text-xs space-y-1 transition ${
                  n.isRead ? 'bg-slate-50 border-slate-100 text-slate-600' : 'bg-emerald-50/60 border-emerald-200 text-slate-900 font-medium'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900">{n.title}</span>
                  <span className="text-[10px] text-slate-400">{formatDateTime(n.createdAt)}</span>
                </div>
                <p className="text-slate-600 leading-relaxed">{n.message}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
};
