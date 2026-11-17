import React, { useState, useEffect } from 'react';
import {
  Bell,
  BellRing,
  CheckCheck,
  Smartphone,
  CheckCircle2,
  AlertTriangle,
  Info,
  ExternalLink
} from 'lucide-react';
import { Modal } from '../../components/common/Modal.js';
import { formatDateTime } from '../../utils/format.js';
import { api } from '../../services/api.js';
import { toast } from 'sonner';
import {
  isNotificationSupported,
  getNotificationPermission,
  requestWebNotificationPermission,
  showWebNotification,
  isIOS,
  isStandalone
} from '../../utils/webNotification.js';

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
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [isRequesting, setIsRequesting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setPermission(getNotificationPermission());
    }
  }, [isOpen]);

  const handleRequestPermission = async () => {
    setIsRequesting(true);
    const result = await requestWebNotificationPermission();
    setIsRequesting(false);
    setPermission(result);

    if (result === 'granted') {
      toast.success('Đã kích hoạt thông báo trên thiết bị thành công!');
      showWebNotification('🎉 GroupPay', {
        body: 'Bạn sẽ nhận được thông báo khi có người thêm chi tiêu hoặc báo trả tiền!'
      });
    } else if (result === 'denied') {
      toast.error('Quyền thông báo bị từ chối trong Cài đặt trình duyệt.');
    }
  };

  const handleSendTestNotification = () => {
    showWebNotification('🔔 GroupPay Thử Nghiệm', {
      body: 'Thông báo trên thiết bị hoạt động rất tốt! Sẵn sàng cho nhóm.'
    });
    toast.success('Đã gửi thông báo thử nghiệm đến thiết bị của bạn');
  };

  const handleMarkAllRead = async () => {
    const res = await api.markAllNotificationsRead(groupCode, currentMemberId || undefined);
    if (res.success) {
      toast.success('Đã đánh dấu đã đọc tất cả');
      onRefresh();
    }
  };

  const iosDevice = isIOS();
  const standalone = isStandalone();

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Thông báo nhóm" maxWidth="md">
      <div className="space-y-4">
        {/* Banner cấu hình thông báo trên thiết bị / iPhone */}
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white p-4 rounded-2xl shadow-sm space-y-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
                <Smartphone className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white flex items-center space-x-1.5">
                  <span>Thông báo Web App (iPhone & Android)</span>
                  {permission === 'granted' && (
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  )}
                </h4>
                <p className="text-[11px] text-slate-300">
                  Hiển thị banner thông báo ngay trên màn hình khóa điện thoại
                </p>
              </div>
            </div>
          </div>

          {/* Trạng thái quyền */}
          {permission === 'granted' ? (
            <div className="flex items-center justify-between pt-1 border-t border-white/10 text-xs">
              <span className="text-emerald-400 flex items-center space-x-1 font-bold text-[11px]">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Đã bật thông báo thiết bị</span>
              </span>
              <button
                type="button"
                onClick={handleSendTestNotification}
                className="bg-white/15 hover:bg-white/25 text-white text-[11px] font-bold px-2.5 py-1 rounded-lg transition active:scale-95"
              >
                Gửi thử
              </button>
            </div>
          ) : permission === 'denied' ? (
            <div className="text-[11px] text-rose-300 bg-rose-500/20 p-2.5 rounded-xl border border-rose-500/30 flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 text-rose-400" />
              <span>
                Quyền thông báo đang bị tắt. Vui lòng vào Cài đặt trình duyệt để cho phép.
              </span>
            </div>
          ) : (
            <div className="space-y-2 pt-1 border-t border-white/10">
              <button
                type="button"
                onClick={handleRequestPermission}
                disabled={isRequesting}
                className="w-full bg-emerald-500 hover:bg-emerald-600 text-slate-900 font-extrabold py-2 px-3 rounded-xl text-xs flex items-center justify-center space-x-1.5 shadow-sm transition active:scale-95 disabled:opacity-50"
              >
                <BellRing className="w-4 h-4" />
                <span>{isRequesting ? 'Đang kích hoạt...' : 'Bật thông báo trên thiết bị'}</span>
              </button>

              {/* Hướng dẫn riêng cho iPhone */}
              {iosDevice && !standalone && (
                <div className="bg-white/10 p-2.5 rounded-xl text-[11px] text-slate-300 space-y-1">
                  <div className="font-bold text-amber-300 flex items-center space-x-1">
                    <Info className="w-3.5 h-3.5" />
                    <span>Lưu ý đặc biệt cho iPhone (iOS 16.4+):</span>
                  </div>
                  <p className="leading-relaxed text-slate-200">
                    Để nhận thông báo đẩy khi màn hình tắt: Trong Safari, bấm nút{' '}
                    <b>Chia sẻ (biểu tượng ô vuông mũi tên ⎋)</b> ➔ Chọn{' '}
                    <b>"Thêm vào MH chính" (Add to Home Screen)</b>.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Danh sách thông báo */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Lịch sử thông báo ({notifications.length})
            </span>
            {notifications.length > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center space-x-1 transition"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Đã đọc tất cả</span>
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <div className="py-8 text-center text-slate-400 space-y-2">
              <Bell className="w-8 h-8 mx-auto opacity-30" />
              <p className="text-xs">Chưa có thông báo nào mới</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto no-scrollbar">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={`p-3 rounded-2xl border text-xs space-y-1 transition ${
                    n.isRead
                      ? 'bg-slate-50 border-slate-100 text-slate-600'
                      : 'bg-emerald-50/70 border-emerald-200 text-slate-900 font-medium shadow-2xs'
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
      </div>
    </Modal>
  );
};
