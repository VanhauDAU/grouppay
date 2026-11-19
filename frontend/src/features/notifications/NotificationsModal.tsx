import React, { useState, useEffect, useMemo } from 'react';
import {
  Bell,
  BellRing,
  CheckCheck,
  AlertTriangle,
  Info,
  Banknote,
  BadgeCheck,
  XCircle,
  Receipt,
  Trash2,
  UserPlus,
  AlarmClock,
  FileClock,
  Volume2,
  VolumeX,
  ChevronRight
} from 'lucide-react';
import { Modal } from '../../components/common/Modal.js';
import { api } from '../../services/api.js';
import { toast } from 'sonner';
import {
  getNotificationPermission,
  requestWebNotificationPermission,
  showWebNotification,
  isIOS,
  isStandalone,
  ensurePushSubscription,
  sendTestPush,
  type PushSetupResult
} from '../../utils/webNotification.js';
import { isSoundEnabled, setSoundEnabled, playSound } from '../../utils/sound.js';

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

type TargetTab = 'DASHBOARD' | 'ACTIVITIES' | 'DEBTS' | 'PAYMENTS';

interface NotificationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupCode: string;
  currentMemberId?: string | null;
  notifications: NotificationItem[];
  onRefresh: () => void;
  /** Đánh dấu đã đọc ngay trên máy (không cần gọi lại /sync) */
  onMarkedAllRead?: () => void;
  /** Chạm vào thông báo -> mở màn hình liên quan */
  onNavigate?: (tab: TargetTab) => void;
}

type Filter = 'ALL' | 'UNREAD' | 'MONEY';

/** Biểu tượng, màu và màn hình đích theo từng loại thông báo */
const TYPE_META: Record<string, { icon: React.ComponentType<any>; tone: string; tab: TargetTab; money?: boolean }> = {
  PAYMENT_PENDING: { icon: Banknote, tone: 'bg-amber-100 text-amber-700', tab: 'DASHBOARD', money: true },
  PAYMENT_CONFIRMED: { icon: BadgeCheck, tone: 'bg-emerald-100 text-emerald-700', tab: 'PAYMENTS', money: true },
  PAYMENT_RECORDED: { icon: BadgeCheck, tone: 'bg-emerald-100 text-emerald-700', tab: 'PAYMENTS', money: true },
  PAYMENT_REJECTED: { icon: XCircle, tone: 'bg-rose-100 text-rose-700', tab: 'PAYMENTS', money: true },
  DEBT_REMINDER: { icon: AlarmClock, tone: 'bg-orange-100 text-orange-700', tab: 'DEBTS', money: true },
  INITIAL_DEBTS_IMPORTED: { icon: FileClock, tone: 'bg-sky-100 text-sky-700', tab: 'DEBTS', money: true },
  ACTIVITY_CREATED: { icon: Receipt, tone: 'bg-indigo-100 text-indigo-700', tab: 'ACTIVITIES' },
  ACTIVITY_CANCELLED: { icon: Trash2, tone: 'bg-slate-200 text-slate-600', tab: 'ACTIVITIES' },
  MEMBER_ADDED: { icon: UserPlus, tone: 'bg-violet-100 text-violet-700', tab: 'DASHBOARD' }
};
const DEFAULT_META = { icon: Bell, tone: 'bg-slate-100 text-slate-600', tab: 'DASHBOARD' as TargetTab };

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'Vừa xong';
  if (min < 60) return `${min} phút trước`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} giờ trước`;
  return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(today) - startOf(d)) / 86400000);
  if (days === 0) return 'Hôm nay';
  if (days === 1) return 'Hôm qua';
  if (days < 7) return d.toLocaleDateString('vi-VN', { weekday: 'long' });
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export const NotificationsModal: React.FC<NotificationsModalProps> = ({
  isOpen,
  onClose,
  groupCode,
  currentMemberId,
  notifications,
  onRefresh,
  onMarkedAllRead,
  onNavigate
}) => {
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [isRequesting, setIsRequesting] = useState(false);
  const [pushState, setPushState] = useState<PushSetupResult | null>(null);
  const [filter, setFilter] = useState<Filter>('ALL');
  const [soundOn, setSoundOn] = useState(isSoundEnabled);

  useEffect(() => {
    if (!isOpen) return;
    setFilter('ALL');
    const perm = getNotificationPermission();
    setPermission(perm);
    if (perm === 'granted' && currentMemberId) {
      ensurePushSubscription(groupCode, currentMemberId).then(setPushState);
    }
  }, [isOpen, groupCode, currentMemberId]);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const visible = useMemo(
    () =>
      notifications.filter((n) => {
        if (filter === 'UNREAD') return !n.isRead;
        if (filter === 'MONEY') return Boolean(TYPE_META[n.type]?.money);
        return true;
      }),
    [notifications, filter]
  );

  const groups = useMemo(() => {
    const out: { label: string; items: NotificationItem[] }[] = [];
    for (const n of visible) {
      const label = dayLabel(n.createdAt);
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(n);
      else out.push({ label, items: [n] });
    }
    return out;
  }, [visible]);

  const handleRequestPermission = async () => {
    if (!currentMemberId) {
      toast.error('Vui lòng chọn tên của bạn trước khi bật thông báo');
      return;
    }
    setIsRequesting(true);
    const result = await requestWebNotificationPermission();
    setPermission(result);
    if (result === 'granted') {
      const push = await ensurePushSubscription(groupCode, currentMemberId);
      setPushState(push);
      toast.success(push === 'ok' ? 'Đã bật thông báo! Bạn sẽ nhận được cả khi đã đóng app.' : 'Đã bật thông báo khi đang mở app.');
    } else if (result === 'denied') {
      toast.error('Quyền thông báo đang bị chặn trong Cài đặt.');
    }
    setIsRequesting(false);
  };

  const handleTest = async () => {
    if (pushState === 'ok' && currentMemberId) {
      const ok = await sendTestPush(groupCode, currentMemberId);
      if (ok) toast.success('Đã gửi thử — kiểm tra thanh thông báo của máy');
      else toast.error('Không gửi được thông báo thử');
      return;
    }
    showWebNotification('🔔 Sổ Nợ Nghĩa Tình', { body: 'Thông báo trên thiết bị hoạt động tốt!' });
  };

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    setSoundEnabled(next);
    if (next) playSound('notify');
  };

  const handleMarkAllRead = async () => {
    if (unreadCount === 0) return;
    onMarkedAllRead?.(); // cập nhật giao diện ngay, không chờ mạng
    const res = await api.markAllNotificationsRead(groupCode, currentMemberId || undefined);
    if (!res.success) onRefresh();
  };

  const handleOpenItem = (n: NotificationItem) => {
    const meta = TYPE_META[n.type] || DEFAULT_META;
    onClose();
    onNavigate?.(meta.tab);
  };

  const iosNeedsInstall = isIOS() && !isStandalone();

  const chip = (key: Filter, label: string) => (
    <button
      type="button"
      onClick={() => setFilter(key)}
      className={`px-3 py-1 rounded-full text-[11px] font-bold transition whitespace-nowrap ${
        filter === key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
      }`}
    >
      {label}
    </button>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Thông báo" maxWidth="md">
      <div className="space-y-3">
        {/* 1. Trạng thái thông báo trên thiết bị */}
        {permission !== 'granted' ? (
          <div className="rounded-2xl bg-gradient-to-br from-slate-900 to-slate-700 text-white p-3.5">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
                <BellRing className="w-5 h-5 text-amber-300" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-extrabold">Nhận thông báo có âm thanh</div>
                <div className="text-[11px] text-white/70 leading-snug">
                  Báo ngay khi có người chuyển tiền, xác nhận hoặc thêm khoản chi — kể cả khi đã đóng app.
                </div>
              </div>
            </div>
            {permission === 'denied' ? (
              <div className="mt-3 text-[11px] text-rose-200 bg-rose-500/20 p-2.5 rounded-xl flex gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 text-rose-300" />
                <span>Thông báo đang bị chặn. Vào Cài đặt &gt; Thông báo &gt; Sổ Nợ để bật lại.</span>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleRequestPermission}
                  disabled={isRequesting}
                  className="mt-3 w-full bg-white text-slate-900 font-extrabold py-2.5 rounded-xl text-xs active:scale-[0.98] transition disabled:opacity-60"
                >
                  {isRequesting ? 'Đang bật...' : 'Bật thông báo'}
                </button>
                {iosNeedsInstall && (
                  <div className="mt-2 text-[11px] text-white/75 flex gap-1.5">
                    <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-amber-300" />
                    <span>
                      iPhone: mở bằng Safari → nút <b>Chia sẻ</b> → <b>Thêm vào MH chính</b>, rồi mở app từ màn hình chính và bật lại ở đây.
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-2xl bg-emerald-50 border border-emerald-200/70 px-3 py-2">
            <BellRing className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span className="text-[11.5px] font-semibold text-emerald-900 flex-1 leading-tight">
              {pushState === 'ok'
                ? 'Đã bật: nhận cả khi đóng app'
                : iosNeedsInstall
                ? 'Thêm app vào MH chính để nhận khi đóng app'
                : 'Đã bật khi đang mở app'}
            </span>
            <button
              type="button"
              onClick={handleTest}
              className="text-[11px] font-bold text-emerald-700 bg-white border border-emerald-200 px-2 py-1 rounded-lg active:scale-95"
            >
              Gửi thử
            </button>
          </div>
        )}

        {/* 2. Bộ lọc + thao tác */}
        <div className="flex items-center gap-1.5">
          {chip('ALL', 'Tất cả')}
          {chip('UNREAD', unreadCount > 0 ? `Chưa đọc · ${unreadCount}` : 'Chưa đọc')}
          {chip('MONEY', 'Tiền bạc')}
          <div className="ml-auto flex items-center gap-0.5">
            <button
              type="button"
              onClick={toggleSound}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
              title={soundOn ? 'Tắt âm thanh trong app' : 'Bật âm thanh trong app'}
              aria-label={soundOn ? 'Tắt âm thanh' : 'Bật âm thanh'}
            >
              {soundOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={handleMarkAllRead}
              disabled={unreadCount === 0}
              className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 disabled:text-slate-300"
              title="Đánh dấu đã đọc tất cả"
              aria-label="Đánh dấu đã đọc tất cả"
            >
              <CheckCheck className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 3. Danh sách, nhóm theo ngày */}
        {groups.length === 0 ? (
          <div className="py-10 text-center text-slate-400">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-2">
              <Bell className="w-6 h-6 opacity-50" />
            </div>
            <p className="text-xs font-semibold">
              {filter === 'UNREAD' ? 'Bạn đã đọc hết thông báo' : 'Chưa có thông báo nào'}
            </p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[55vh] overflow-y-auto no-scrollbar -mx-1 px-1">
            {groups.map((g) => (
              <div key={g.label}>
                <div className="text-[10.5px] font-bold text-slate-400 uppercase tracking-wider px-1 mb-1">{g.label}</div>
                <div className="space-y-1">
                  {g.items.map((n) => {
                    const meta = TYPE_META[n.type] || DEFAULT_META;
                    const Icon = meta.icon;
                    return (
                      <button
                        type="button"
                        key={n.id}
                        onClick={() => handleOpenItem(n)}
                        className={`w-full text-left flex items-start gap-3 p-2.5 rounded-2xl transition active:scale-[0.99] ${
                          n.isRead ? 'hover:bg-slate-50' : 'bg-sky-50/70 hover:bg-sky-50'
                        }`}
                      >
                        <div className={`relative w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${meta.tone}`}>
                          <Icon className="w-[18px] h-[18px]" />
                          {!n.isRead && (
                            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-sky-500 ring-2 ring-white" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2">
                            <span
                              className={`text-[13px] truncate ${
                                n.isRead ? 'font-semibold text-slate-700' : 'font-extrabold text-slate-900'
                              }`}
                            >
                              {n.title}
                            </span>
                            <span className="ml-auto text-[10px] text-slate-400 whitespace-nowrap">{relativeTime(n.createdAt)}</span>
                          </div>
                          <p className="text-[12px] text-slate-500 leading-snug line-clamp-2">{n.message}</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-300 self-center flex-shrink-0" />
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
};
