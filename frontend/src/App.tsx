import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  LayoutDashboard,
  Receipt,
  Scale,
  CreditCard,
  Users,
  History,
  Bell,
  Share2,
  Plus,
  Wifi,
  WifiOff,
  Copy,
  ChevronDown,
  ArrowLeft,
  Palette
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { api } from './services/api.js';
import { useRealtime } from './hooks/useRealtime.js';
import { HomeScreen } from './features/groups/HomeScreen.js';
import { SelectMemberModal } from './features/groups/SelectMemberModal.js';
import { DashboardView } from './features/dashboard/DashboardView.js';
import { ActivitiesView } from './features/activities/ActivitiesView.js';
import { DebtsView } from './features/debts/DebtsView.js';
import { PaymentsView } from './features/payments/PaymentsView.js';
import { MembersView } from './features/members/MembersView.js';
import { HistoryView } from './features/history/HistoryView.js';
import { ExportDebtImageModal } from './features/debts/ExportDebtImageModal.js';
import { NotificationsModal } from './features/notifications/NotificationsModal.js';
import { PaymentModal } from './features/payments/PaymentModal.js';
import { RecordReceivedModal } from './features/payments/RecordReceivedModal.js';
import { CreateActivityModal } from './features/activities/CreateActivityModal.js';
import { BankConfigModal } from './features/members/BankConfigModal.js';
import { EditProfileModal } from './features/members/EditProfileModal.js';
import { getThemeFromHex, applyThemeToDocument, DEFAULT_HEX } from './utils/theme.js';
import { Avatar } from './components/common/Avatar.js';
import { BottomNav } from './components/common/BottomNav.js';
import { OnboardingTour, hasSeenTour, markTourSeen, type TourStep } from './components/common/OnboardingTour.js';
import { playSound } from './utils/sound.js';
import { formatGroupCode, normalizeGroupCodeInput } from '@tinhtien/shared';
import { getSavedMember, saveMember, upsertRecentGroup, getOwnerToken, forgetGroup } from './utils/recentGroups.js';
import { DeleteGroupSection } from './features/groups/DeleteGroupSection.js';
import { getInitials, getAvatarColor } from './utils/format.js';
import { initServiceWorker, showWebNotification, ensurePushSubscription } from './utils/webNotification.js';

type TabType = 'DASHBOARD' | 'ACTIVITIES' | 'DEBTS' | 'PAYMENTS' | 'MEMBERS' | 'HISTORY';

export function App() {
  // Trạng thái định vị nhóm
  const [currentGroupCode, setCurrentGroupCode] = useState<string | null>(() => {
    // Kiểm tra URL pathname hoặc query string
    const match = window.location.pathname.match(/\/group\/([a-zA-Z0-9_-]+)/);
    if (match) return normalizeGroupCodeInput(match[1]);
    const params = new URLSearchParams(window.location.search);
    const q = params.get('group');
    return q ? normalizeGroupCodeInput(q) : null;
  });

  const [currentMember, setCurrentMember] = useState<{ id: string; name: string; status: string; avatarUrl?: string | null } | null>(
    () => getSavedMember(currentGroupCode)
  );

  const [activeTab, setActiveTab] = useState<TabType>('DASHBOARD');

  // Dữ liệu nhóm
  const [groupInfo, setGroupInfo] = useState<any | null>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [dashboardData, setDashboardData] = useState<any | null>(null);
  const [activities, setActivities] = useState<any[]>([]);
  const [debtsData, setDebtsData] = useState<any | null>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);

  // Modals state
  const [isSelectMemberOpen, setIsSelectMemberOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentRecipientId, setPaymentRecipientId] = useState<string | null>(null);
  const [paymentDefaultAmount, setPaymentDefaultAmount] = useState<number | undefined>(undefined);
  const [isCreateActivityOpen, setIsCreateActivityOpen] = useState(false);
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [bankConfigMember, setBankConfigMember] = useState<any | null>(null);
  const [isExportDebtImageOpen, setIsExportDebtImageOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [profileTargetMember, setProfileTargetMember] = useState<any | null>(null);
  const [currentThemeHex, setCurrentThemeHex] = useState<string>(() => {
    return localStorage.getItem('tinhtien_user_theme_hex') || DEFAULT_HEX;
  });

  const isFetchingRef = useRef(false);
  const groupGoneRef = useRef<((msg: string) => void) | null>(null);
  const pendingFetchRef = useRef(false);
  const fetchDebounceRef = useRef<any>(null);
  const memberIdRef = useRef<string | null>(currentMember?.id || null);
  memberIdRef.current = currentMember?.id || null;
  const [hasLoaded, setHasLoaded] = useState(false);

  // Load toàn bộ dữ liệu nhóm TRONG 1 REQUEST DUY NHẤT (/sync).
  // Nếu đang có request chạy, chỉ xếp hàng ĐÚNG 1 lần đồng bộ tiếp theo (không bỏ lỡ cập nhật, không dồn request).
  const fetchAllData = useCallback(async () => {
    if (!currentGroupCode) return;
    if (isFetchingRef.current) {
      pendingFetchRef.current = true;
      return;
    }
    isFetchingRef.current = true;

    try {
      do {
        pendingFetchRef.current = false;
        const requestedMemberId = memberIdRef.current;
        const syncRes = await api.getGroupSync(currentGroupCode, requestedMemberId);
        // Người dùng đổi tên trong lúc chờ -> bỏ kết quả cũ, đồng bộ lại cho đúng người
        if (requestedMemberId !== memberIdRef.current) {
          pendingFetchRef.current = true;
          continue;
        }
        if (!syncRes.success && (syncRes as any).status === 404) {
          // Nhóm đã bị xóa hoặc link sai -> dọn khỏi máy và về màn hình chính
          groupGoneRef.current?.('Nhóm không còn tồn tại hoặc link không đúng');
          return;
        }
        if (syncRes.success && syncRes.data) {
          const { group, members: mData, dashboard, activities: aData, debts, payments: pData, notifications: nData } = syncRes.data;
          if (group) {
            setGroupInfo(group);
            // Gõ "k7mq-4xpz" vẫn vào được -> đưa về địa chỉ chuẩn để chia sẻ/lưu đúng
            if (group.publicCode && !window.location.pathname.endsWith(`/group/${group.publicCode}`)) {
              window.history.replaceState({}, '', `/group/${group.publicCode}`);
            }
            // Ghi nhớ nhóm đã tham gia để hiện ở màn hình chính (kể cả vào bằng link / mã)
            const me = mData?.find((m: any) => m.id === requestedMemberId);
            upsertRecentGroup({
              id: group.id,
              publicCode: group.publicCode || currentGroupCode,
              name: group.name,
              memberName: me?.name || null,
              memberCount: mData?.length
            });
          }
          if (mData) {
            setMembers(mData);
            if (!requestedMemberId || !mData.some((m: any) => m.id === requestedMemberId)) {
              setIsSelectMemberOpen(true);
            }
          }
          if (dashboard) setDashboardData(dashboard);
          if (aData) setActivities(aData);
          if (debts) setDebtsData(debts);
          if (pData) setPayments(pData);
          if (nData) setNotifications(nData);
        }
      } while (pendingFetchRef.current);
    } catch (err) {
      console.error('Sync fetch error:', err);
    } finally {
      isFetchingRef.current = false;
      setHasLoaded(true);
    }
  }, [currentGroupCode]);

  // Debounce gộp nhiều event realtime liên tiếp thành 1 request duy nhất
  const debouncedFetchAllData = useCallback(() => {
    if (fetchDebounceRef.current) clearTimeout(fetchDebounceRef.current);
    fetchDebounceRef.current = setTimeout(() => {
      fetchAllData();
    }, 400);
  }, [fetchAllData]);

  // Đồng bộ lần đầu khi vào nhóm: đúng 1 request (StrictMode ở dev chạy effect 2 lần -> chặn bằng ref)
  const initialSyncGroupRef = useRef<string | null>(null);
  useEffect(() => {
    if (!currentGroupCode) {
      initialSyncGroupRef.current = null;
      return;
    }
    if (initialSyncGroupRef.current === currentGroupCode) return;
    initialSyncGroupRef.current = currentGroupCode;
    setHasLoaded(false);
    fetchAllData();
  }, [currentGroupCode, fetchAllData]);

  // Đổi người dùng -> đồng bộ lại dữ liệu cá nhân (1 request). Bỏ qua lần mount đầu (đã sync ở trên).
  const prevMemberIdRef = useRef(currentMember?.id);
  useEffect(() => {
    if (prevMemberIdRef.current === currentMember?.id) return;
    prevMemberIdRef.current = currentMember?.id;
    if (currentGroupCode && currentMember?.id) fetchAllData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMember?.id]);

  // Cập nhật theme theo cấu hình thành viên
  useEffect(() => {
    if (currentMember) {
      const mem = members.find((m: any) => m.id === currentMember.id) || currentMember;
      if (mem.avatarUrl?.startsWith('color:#')) {
        const hex = mem.avatarUrl.replace('color:', '');
        setCurrentThemeHex(hex);
        applyThemeToDocument(hex);
      }
    }
  }, [currentMember, members]);

  useEffect(() => {
    applyThemeToDocument(currentThemeHex);
  }, [currentThemeHex]);

  const currentTheme = getThemeFromHex(currentThemeHex);

  // Load history khi chuyển sang tab history
  useEffect(() => {
    if (currentGroupCode && activeTab === 'HISTORY') {
      api.getHistory(currentGroupCode).then((res) => {
        if (res.success && res.data) setHistory(res.data);
      });
    }
  }, [currentGroupCode, activeTab]);

  // Đăng ký Service Worker cho thông báo thiết bị / iPhone
  useEffect(() => {
    initServiceWorker();
  }, []);

  // Thiết bị đã cấp quyền -> tự đăng ký/ cập nhật Web Push cho đúng người đang dùng (không hỏi lại quyền)
  const pushActiveRef = useRef(false);
  useEffect(() => {
    pushActiveRef.current = false;
    if (!currentGroupCode || !currentMember?.id) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    ensurePushSubscription(currentGroupCode, currentMember.id).then((r) => {
      pushActiveRef.current = r === 'ok';
    });
  }, [currentGroupCode, currentMember?.id]);

  // Push tới khi app đang mở -> đồng bộ ngay (phòng khi WebSocket đang bị treo nền)
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === 'PUSH_RECEIVED') debouncedFetchAllData();
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [debouncedFetchAllData]);

  // Realtime hook
  const handleRealtimeEvent = useCallback(
    (event: any) => {
      const me = memberIdRef.current;
      if (event.eventType === 'group.deleted') {
        groupGoneRef.current?.(`Nhóm "${event.payload?.name || ''}" đã bị người tạo xóa`);
        return;
      }
      // Sự kiện do chính mình tạo: màn hình đã tự đồng bộ sau thao tác -> không gửi thêm request
      if (me && event.actorMemberId === me) return;

      debouncedFetchAllData();

      const payload = event.payload || {};
      if (event.eventType === 'payment.created' && payload.recipientMemberId === me) {
        playSound('notify');
        toast.info(`${payload.payerName || 'Có người'} vừa báo đã chuyển tiền cho bạn — hãy xác nhận!`);
        if (!pushActiveRef.current) showWebNotification('Sổ Nợ Nghĩa Tình: Yêu Cầu Xác Nhận', {
          body: 'Có thành viên vừa báo đã trả tiền, hãy mở ứng dụng để xác nhận!'
        });
      } else if (event.eventType === 'payment.confirmed' && payload.payerMemberId === me) {
        playSound('money');
        toast.success('Khoản chuyển tiền của bạn đã được xác nhận!');
        if (!pushActiveRef.current) showWebNotification('Sổ Nợ Nghĩa Tình: Đã Nhận Tiền', {
          body: 'Khoản chuyển tiền đã được người nhận xác nhận thành công!'
        });
      } else if (event.eventType === 'payment.rejected' && payload.payerMemberId === me) {
        playSound('error');
        toast.error('Yêu cầu chuyển tiền của bạn bị từ chối');
      } else if (event.eventType === 'activity.created') {
        playSound('notify');
        toast.info('Vừa có hoạt động chi tiêu mới được thêm!');
        if (!pushActiveRef.current) showWebNotification('Sổ Nợ Nghĩa Tình: Chi Tiêu Mới', {
          body: 'Vừa có hoạt động chi tiêu mới được thêm vào nhóm của bạn!'
        });
      }
    },
    [debouncedFetchAllData]
  );

  const { isConnected } = useRealtime(currentGroupCode, currentMember?.id || null, {
    onEvent: handleRealtimeEvent,
    onWakeup: debouncedFetchAllData
  });

  // Khóa thao tác xác nhận / từ chối theo từng giao dịch: chống bấm đúp gửi 2 request
  const paymentActionLockRef = useRef<Set<string>>(new Set());
  const [busyPaymentIds, setBusyPaymentIds] = useState<string[]>([]);
  const runPaymentAction = useCallback(
    async (paymentId: string, action: () => Promise<{ success: boolean; error?: string }>, successMsg: string) => {
      if (paymentActionLockRef.current.has(paymentId)) return false;
      paymentActionLockRef.current.add(paymentId);
      setBusyPaymentIds((ids) => [...ids, paymentId]);
      try {
        const res = await action();
        if (res.success) {
          playSound(successMsg.includes('nhận tiền') ? 'money' : 'success');
          toast.success(successMsg);
        } else {
          playSound('error');
          toast.error(res.error || 'Không thể xử lý giao dịch');
        }
        return res.success;
      } finally {
        paymentActionLockRef.current.delete(paymentId);
        setBusyPaymentIds((ids) => ids.filter((id) => id !== paymentId));
        fetchAllData();
      }
    },
    [fetchAllData]
  );

  // Đổi nhóm: nạp đúng "tôi là ai" của nhóm đó và xóa dữ liệu nhóm cũ khỏi màn hình
  const switchGroup = useCallback((code: string | null) => {
    const member = getSavedMember(code);
    prevMemberIdRef.current = member?.id; // tránh effect "đổi người" gửi thêm 1 request /sync trùng
    setCurrentGroupCode(code);
    setCurrentMember(member);
    setGroupInfo(null);
    setMembers([]);
    setDashboardData(null);
    setActivities([]);
    setDebtsData(null);
    setPayments([]);
    setNotifications([]);
    setActiveTab('DASHBOARD');
  }, []);

  const handleSelectGroup = (code: string) => {
    switchGroup(code);
    window.history.pushState({}, '', `/group/${code}`);
  };

  // Nhóm bị xóa (bởi mình hoặc người tạo trên máy khác) -> dọn dữ liệu cục bộ, về màn hình chính
  groupGoneRef.current = (msg: string) => {
    if (!currentGroupCode) return;
    forgetGroup(currentGroupCode);
    switchGroup(null);
    window.history.replaceState({}, '', '/');
    toast.info(msg);
  };

  const handleBackToHome = () => {
    switchGroup(null);
    window.history.pushState({}, '', '/');
  };

  // Nút/cử chỉ "quay lại" của trình duyệt & điện thoại: đồng bộ theo URL
  useEffect(() => {
    const onPop = () => {
      const match = window.location.pathname.match(/\/group\/([a-zA-Z0-9_-]+)/);
      const code = match ? match[1] : null;
      if (code !== currentGroupCode) switchGroup(code);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [currentGroupCode, switchGroup]);

  const handleSelectMember = (member: { id: string; name: string; status: string }) => {
    setCurrentMember(member);
    if (currentGroupCode) saveMember(currentGroupCode, member);
    // Dữ liệu cá nhân được đồng bộ lại bởi effect theo currentMember.id (1 request duy nhất)
  };

  // Mời bạn bè: điện thoại mở bảng chia sẻ (Zalo, Messenger...), máy tính thì sao chép lời mời
  const handleShareLink = async () => {
    const code = groupInfo?.publicCode || currentGroupCode || '';
    const url = `${window.location.origin}/group/${code}`;
    const name = groupInfo?.name || 'nhóm';
    const text = `Mời bạn vào nhóm "${name}" trên Sổ Nợ Nghĩa Tình để cùng ghi chi tiêu & công nợ.\n👉 ${url}\nMã nhóm: ${formatGroupCode(code)}`;
    if (navigator.share && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
      try {
        await navigator.share({ title: `Nhóm ${name}`, text, url });
        return;
      } catch (err: any) {
        if (err?.name === 'AbortError') return; // người dùng tự đóng bảng chia sẻ
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Đã sao chép lời mời (kèm link & mã nhóm) — dán vào Zalo/Messenger để gửi');
    } catch {
      toast.info(`Mã nhóm: ${formatGroupCode(code)}`);
    }
  };

  const [receivedFrom, setReceivedFrom] = useState<{ id: string; name: string; avatarUrl?: string | null; amount: number } | null>(null);
  const handleOpenRecordReceived = (debtorId: string, amount: number) => {
    const m = members.find((x: any) => x.id === debtorId);
    if (m) setReceivedFrom({ id: m.id, name: m.name, avatarUrl: m.avatarUrl, amount });
  };

  const handleOpenPayment = (recipientId?: string, defaultAmount?: number) => {
    setPaymentRecipientId(recipientId || null);
    setPaymentDefaultAmount(defaultAmount);
    setIsPaymentModalOpen(true);
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  // ===== Hướng dẫn người mới (chạy hoàn toàn trên máy, không tốn request) =====
  const [isTourOpen, setIsTourOpen] = useState(false);
  const anyModalOpen =
    isSelectMemberOpen ||
    isPaymentModalOpen ||
    isCreateActivityOpen ||
    isNotificationsOpen ||
    isProfileModalOpen ||
    Boolean(bankConfigMember) ||
    Boolean(receivedFrom);

  // Tự mở 1 lần cho người mới: đã vào nhóm, đã chọn tên, dữ liệu đã tải, không có popup nào đang mở
  useEffect(() => {
    if (!currentGroupCode || !hasLoaded || !currentMember || anyModalOpen || isTourOpen) return;
    if (activeTab !== 'DASHBOARD' || hasSeenTour()) return;
    const t = setTimeout(() => setIsTourOpen(true), 900); // chờ hiệu ứng mở app chạy xong
    return () => clearTimeout(t);
  }, [currentGroupCode, hasLoaded, currentMember, anyModalOpen, isTourOpen, activeTab]);

  const startTour = () => {
    setActiveTab('DASHBOARD');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => setIsTourOpen(true), 450);
  };

  const finishTour = () => {
    setIsTourOpen(false);
    markTourSeen();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const tourSteps: TourStep[] = [
    {
      emoji: '👋',
      title: 'Chào mừng đến Sổ Nợ Nghĩa Tình!',
      body: 'Ghi chi tiêu chung, app tự chia tiền và tính ai nợ ai đến từng đồng. Xem nhanh vài điểm chính nhé (30 giây).'
    },
    {
      target: 'member-pill',
      emoji: '🙋',
      title: 'Đây là bạn',
      body: 'Chọn đúng tên của bạn để xem mình nợ ai, ai nợ mình. Bấm vào đây nếu cần đổi.'
    },
    {
      target: 'balance-card',
      emoji: '💰',
      title: 'Số dư của bạn',
      body: (
        <>
          Số <b className="text-rose-600">đỏ</b> là bạn cần trả, số <b className="text-emerald-600">xanh</b> là bạn được nhận lại.
          Chuyển khoản xong thì bấm <b>"Báo đã trả tiền"</b>.
        </>
      )
    },
    {
      target: 'fab-add',
      emoji: '🧾',
      title: 'Thêm khoản chi',
      body: 'Nhập số tiền, chọn ai trả và chia cho ai. App tự chia đều, phần lẻ không lệch 1 đồng.'
    },
    {
      target: 'nav-debts',
      emoji: '⚖️',
      title: 'Công nợ',
      body: 'Xem ai nợ ai, mở sổ đối chiếu từng khoản và xuất ảnh gửi vào nhóm Zalo / Messenger.'
    },
    {
      target: 'nav-payments',
      emoji: '✅',
      title: 'Trả nợ minh bạch',
      body: (
        <>
          Người trả bấm <b>"Báo đã trả"</b>, người nhận bấm <b>"Đã nhận"</b> thì nợ mới được trừ. Trả tiền mặt ngoài app? Người
          nhận bấm "Đã nhận" để ghi lại.
        </>
      )
    },
    {
      target: 'bell',
      emoji: '🔔',
      title: 'Bật thông báo',
      body: 'Nhận tin có âm thanh ngay khi có người chuyển tiền hoặc thêm khoản chi — kể cả khi đã đóng app.'
    },
    {
      target: 'share-code',
      emoji: '🔗',
      title: 'Mời cả nhóm',
      body: 'Bấm mã nhóm để sao chép link rồi gửi cho mọi người. Không cần tạo tài khoản, ai có link đều vào được.'
    }
  ];

  // Ẩn splash khi đã có thứ để hiển thị: màn hình chọn nhóm hiện ngay, màn hình nhóm chờ lần đồng bộ đầu
  useEffect(() => {
    if (!currentGroupCode || hasLoaded) window.__hideSplash?.();
  }, [currentGroupCode, hasLoaded]);

  // Nếu chưa chọn nhóm -> Hiển thị HomeScreen
  if (!currentGroupCode) {
    return (
      <>
        <Toaster position="top-center" richColors />
        <HomeScreen onSelectGroup={handleSelectGroup} />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between">
      <Toaster position="top-center" richColors />

      {/* Top Header Navbar - Gọn gàng & Tối ưu Mobile */}
      <header
        className="sticky top-0 z-40 glass-header border-b border-white/60 shadow-[0_1px_0_rgba(15,23,42,0.06)] px-3 sm:px-4 py-2 animate-slide-down"
        style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}
      >
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-2 min-w-0">
            <button
              onClick={handleBackToHome}
              className="p-1.5 -ml-1 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition flex-shrink-0"
              title="Về danh sách nhóm"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>

            <div className="min-w-0">
              <div className="flex items-center space-x-1.5">
                <h2 className="text-sm sm:text-base font-black text-slate-900 tracking-tight truncate max-w-[120px] sm:max-w-[220px]">
                  {groupInfo?.name || 'Nhóm của bạn'}
                </h2>
                {/* Live connection status dot */}
                <span
                  className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'
                    }`}
                  title={isConnected ? 'Đang kết nối Realtime' : 'Mất kết nối'}
                />
              </div>
              <button
                data-tour="share-code"
                onClick={handleShareLink}
                className="text-[10px] text-slate-500 hover:text-emerald-600 flex items-center space-x-1 transition"
              >
                <span className="font-mono tracking-wide">Mã: {formatGroupCode(groupInfo?.publicCode || currentGroupCode)}</span>
                <Copy className="w-2.5 h-2.5" />
              </button>
            </div>
          </div>

          <div className="flex items-center space-x-1 sm:space-x-1.5 flex-shrink-0">
            {/* Member selector pill */}
            <button
              data-tour="member-pill"
              onClick={() => setIsSelectMemberOpen(true)}
              className="flex items-center space-x-1 bg-slate-100 hover:bg-slate-200 text-slate-800 pl-1.5 pr-2 py-1 rounded-full text-xs font-bold transition active:scale-95"
            >
              <Avatar name={currentMember?.name || '?'} avatarUrl={currentMember?.avatarUrl} size="xs" />
              <span className="max-w-[65px] truncate">{currentMember?.name || 'Chọn tôi'}</span>
              <ChevronDown className="w-2.5 h-2.5 text-slate-400" />
            </button>

            {/* Profile Avatar & Color Picker Button */}
            <button
              onClick={() => {
                setProfileTargetMember(currentMember);
                setIsProfileModalOpen(true);
              }}
              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition active:scale-95"
              title="Đổi màu chủ đạo & Ảnh đại diện"
            >
              <Palette className="w-4 h-4" style={{ color: currentTheme.hex }} />
            </button>

            {/* Thành viên (chuyển từ thanh dưới lên để thanh dưới cân đối 2 | + | 2) */}
            <button
              data-tour="members"
              onClick={() => setActiveTab('MEMBERS')}
              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition active:scale-95"
              style={activeTab === 'MEMBERS' ? { color: currentTheme.hex } : undefined}
              title="Thành viên nhóm"
              aria-label="Thành viên nhóm"
            >
              <Users className="w-4 h-4" />
            </button>

            {/* Notification bell */}
            <button
              data-tour="bell"
              onClick={() => setIsNotificationsOpen(true)}
              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl relative transition active:scale-95"
              title="Thông báo nhóm"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-rose-500 rounded-full" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main
        key={activeTab}
        className="flex-1 max-w-2xl w-full mx-auto p-4 sm:p-5 animate-fade-up"
        style={{ paddingBottom: 'calc(96px + env(safe-area-inset-bottom))' }}
      >
        {activeTab === 'DASHBOARD' && (
          <DashboardView
            data={dashboardData}
            currentTheme={currentTheme}
            onOpenPaymentModal={handleOpenPayment}
            onOpenRecordReceived={handleOpenRecordReceived}
            onOpenCreateActivity={() => setIsCreateActivityOpen(true)}
            busyPaymentIds={busyPaymentIds}
            onConfirmPayment={(pId) =>
              runPaymentAction(
                pId,
                () => api.confirmPayment(currentGroupCode, currentMember?.id || 'anonymous', pId),
                'Đã xác nhận nhận tiền'
              )
            }
            onRejectPayment={(pId) => {
              const reason = window.prompt('Nhập lý do từ chối (ít nhất 2 ký tự):');
              if (reason && reason.trim().length >= 2) {
                runPaymentAction(
                  pId,
                  () => api.rejectPayment(currentGroupCode, currentMember?.id || 'anonymous', pId, reason.trim()),
                  'Đã từ chối giao dịch'
                );
              } else if (reason !== null) {
                toast.error('Vui lòng nhập lý do từ chối (ít nhất 2 ký tự)');
              }
            }}
            onOpenSelectMember={() => setIsSelectMemberOpen(true)}
            onOpenBankConfig={() => {
              const current = members.find((m: any) => m.id === currentMember?.id) || currentMember;
              if (current) {
                setBankConfigMember(current);
              } else {
                setIsSelectMemberOpen(true);
              }
            }}
            onOpenProfileModal={() => {
              setProfileTargetMember(currentMember);
              setIsProfileModalOpen(true);
            }}
            onNavigateToActivities={() => setActiveTab('ACTIVITIES')}
            onStartTour={startTour}
            onShareLink={handleShareLink}
            onNavigateToDebts={() => setActiveTab('DEBTS')}
          />
        )}

        {activeTab === 'ACTIVITIES' && (
          <ActivitiesView
            groupCode={currentGroupCode}
            currentMemberId={currentMember?.id}
            members={members}
            activities={activities}
            onRefresh={fetchAllData}
            onOpenCreateModal={() => setIsCreateActivityOpen(true)}
          />
        )}

        {activeTab === 'DEBTS' && (
          <DebtsView
            groupCode={currentGroupCode}
            groupName={groupInfo?.name}
            currentMemberId={currentMember?.id}
            members={members}
            debtsData={debtsData}
            dashboardData={dashboardData}
            onRefresh={fetchAllData}
            onOpenPaymentModal={handleOpenPayment}
            onOpenRecordReceived={handleOpenRecordReceived}
          />
        )}

        {activeTab === 'PAYMENTS' && (
          <PaymentsView
            groupCode={currentGroupCode}
            currentMemberId={currentMember?.id}
            payments={payments}
            onRefresh={fetchAllData}
            busyPaymentIds={busyPaymentIds}
            runPaymentAction={runPaymentAction}
          />
        )}

        {activeTab === 'MEMBERS' && (
          <MembersView
            groupCode={currentGroupCode}
            currentMemberId={currentMember?.id}
            members={members}
            onRefresh={fetchAllData}
            isOpenAddModal={isAddMemberOpen}
            onOpenAddModal={() => setIsAddMemberOpen(true)}
            onCloseAddModal={() => setIsAddMemberOpen(false)}
            onOpenBankConfig={(m) => setBankConfigMember(m)}
            onOpenThemePicker={(m) => {
              setProfileTargetMember(m);
              setIsProfileModalOpen(true);
            }}
          />
        )}

        {activeTab === 'MEMBERS' && getOwnerToken(currentGroupCode) && (
          <DeleteGroupSection
            groupCode={currentGroupCode}
            groupName={groupInfo?.name || ''}
            ownerToken={getOwnerToken(currentGroupCode)!}
            onDeleted={() => {
              forgetGroup(currentGroupCode);
              switchGroup(null);
              window.history.replaceState({}, '', '/');
            }}
          />
        )}

        {activeTab === 'HISTORY' && (
          <HistoryView
            history={history}
            onSearch={(filters) => {
              api.getHistory(currentGroupCode, filters as any).then((res) => {
                if (res.success && res.data) setHistory(res.data);
              });
            }}
          />
        )}
      </main>

      {/* Thanh điều hướng dưới: kính mờ nổi, nút thêm nằm trong rãnh cong */}
      <BottomNav
        activeTab={activeTab}
        accentHex={currentTheme.hex}
        onChange={(tab) => setActiveTab(tab)}
        onAdd={() => setIsCreateActivityOpen(true)}
        paymentBadge={dashboardData?.personal?.pendingReceived?.length || 0}
      />

      {/* Global Modals */}
      <SelectMemberModal
        isOpen={isSelectMemberOpen}
        onClose={() => setIsSelectMemberOpen(false)}
        groupCode={currentGroupCode}
        members={members}
        currentMemberId={currentMember?.id}
        onSelectMember={handleSelectMember}
        onMemberCreated={fetchAllData}
      />

      <EditProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => {
          setIsProfileModalOpen(false);
          setProfileTargetMember(null);
        }}
        groupCode={currentGroupCode}
        member={profileTargetMember || currentMember}
        onThemeChanged={(hex) => setCurrentThemeHex(hex)}
        onSuccess={fetchAllData}
      />

      <PaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        groupCode={currentGroupCode}
        currentMemberId={currentMember?.id}
        members={members}
        initialRecipientId={paymentRecipientId}
        initialAmount={paymentDefaultAmount}
        pendingPayments={payments.filter((p: any) => p.status === 'PENDING_CONFIRMATION' && p.payer_member_id === currentMember?.id)}
        peopleIOwe={dashboardData?.personal?.peopleIOwe || []}
        onPaymentSuccess={fetchAllData}
      />

      <OnboardingTour open={isTourOpen} steps={tourSteps} accentHex={currentTheme.hex} onFinish={finishTour} />

      <RecordReceivedModal
        isOpen={Boolean(receivedFrom)}
        onClose={() => setReceivedFrom(null)}
        groupCode={currentGroupCode}
        currentMemberId={currentMember?.id}
        debtor={receivedFrom}
        onSuccess={fetchAllData}
      />

      <CreateActivityModal
        isOpen={isCreateActivityOpen}
        onClose={() => setIsCreateActivityOpen(false)}
        groupCode={currentGroupCode}
        currentMemberId={currentMember?.id}
        members={members}
        onSuccess={fetchAllData}
      />

      <BankConfigModal
        isOpen={Boolean(bankConfigMember)}
        onClose={() => setBankConfigMember(null)}
        groupCode={currentGroupCode}
        member={bankConfigMember}
        onSuccess={fetchAllData}
      />

      <ExportDebtImageModal
        isOpen={isExportDebtImageOpen}
        onClose={() => setIsExportDebtImageOpen(false)}
        groupName={groupInfo?.name || 'Nhóm của bạn'}
        groupCode={currentGroupCode}
        members={members}
        debtsData={debtsData}
        dashboardData={dashboardData}
      />

      <NotificationsModal
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
        groupCode={currentGroupCode}
        currentMemberId={currentMember?.id}
        notifications={notifications}
        onRefresh={fetchAllData}
        onMarkedAllRead={() => setNotifications((list) => list.map((n: any) => ({ ...n, isRead: true })))}
        onNavigate={(tab) => setActiveTab(tab)}
      />
    </div>
  );
}
