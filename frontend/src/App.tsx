import React, { useState, useEffect, useCallback } from 'react';
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
import { CreateActivityModal } from './features/activities/CreateActivityModal.js';
import { BankConfigModal } from './features/members/BankConfigModal.js';
import { EditProfileModal } from './features/members/EditProfileModal.js';
import { getThemeFromHex, applyThemeToDocument, DEFAULT_HEX } from './utils/theme.js';
import { Avatar } from './components/common/Avatar.js';
import { getInitials, getAvatarColor } from './utils/format.js';
import { initServiceWorker, showWebNotification } from './utils/webNotification.js';

type TabType = 'DASHBOARD' | 'ACTIVITIES' | 'DEBTS' | 'PAYMENTS' | 'MEMBERS' | 'HISTORY';

export function App() {
  // Trạng thái định vị nhóm
  const [currentGroupCode, setCurrentGroupCode] = useState<string | null>(() => {
    // Kiểm tra URL pathname hoặc query string
    const match = window.location.pathname.match(/\/group\/([a-zA-Z0-9_-]+)/);
    if (match) return match[1];
    const params = new URLSearchParams(window.location.search);
    return params.get('group');
  });

  const [currentMember, setCurrentMember] = useState<{ id: string; name: string; status: string; avatarUrl?: string | null } | null>(() => {
    try {
      const saved = localStorage.getItem('tinhtien_current_member');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

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

  // Load toàn bộ dữ liệu nhóm
  const fetchAllData = useCallback(async () => {
    if (!currentGroupCode) return;

    try {
      const [gRes, mRes, dRes, aRes, debRes, pRes, nRes] = await Promise.all([
        api.getGroup(currentGroupCode),
        api.getMembers(currentGroupCode),
        api.getDashboard(currentGroupCode, currentMember?.id),
        api.getActivities(currentGroupCode),
        api.getDebts(currentGroupCode),
        api.getPayments(currentGroupCode),
        api.getNotifications(currentGroupCode, currentMember?.id)
      ]);

      if (gRes.success && gRes.data) setGroupInfo(gRes.data);
      if (mRes.success && mRes.data) {
        setMembers(mRes.data);
        if (currentMember) {
          const fresh = mRes.data.find((m: any) => m.id === currentMember.id);
          if (fresh && (fresh.avatarUrl !== currentMember.avatarUrl || fresh.name !== currentMember.name)) {
            setCurrentMember(fresh);
            localStorage.setItem('tinhtien_current_member', JSON.stringify(fresh));
          }
        } else {
          setIsSelectMemberOpen(true);
        }
      }
      if (dRes.success && dRes.data) setDashboardData(dRes.data);
      if (aRes.success && aRes.data) setActivities(aRes.data);
      if (debRes.success && debRes.data) setDebtsData(debRes.data);
      if (pRes.success && pRes.data) setPayments(pRes.data);
      if (nRes.success && nRes.data) setNotifications(nRes.data);
    } catch (err) {
      console.error('Fetch error:', err);
    }
  }, [currentGroupCode, currentMember]);

  useEffect(() => {
    if (currentGroupCode) {
      fetchAllData();
    }
  }, [currentGroupCode, fetchAllData]);

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

  // Realtime hook
  const handleRealtimeEvent = useCallback(
    (event: any) => {
      // Khi có sự kiện từ người khác gửi tới
      fetchAllData();
      if (event.eventType === 'payment.created') {
        toast.info('Có yêu cầu xác nhận chuyển khoản mới!');
        showWebNotification('Sổ Nợ Nghĩa Tình: Yêu Cầu Xác Nhận', {
          body: 'Có thành viên vừa báo đã trả tiền, hãy mở ứng dụng để xác nhận!'
        });
      } else if (event.eventType === 'payment.confirmed') {
        toast.success('Khoản chuyển tiền đã được xác nhận!');
        showWebNotification('Sổ Nợ Nghĩa Tình: Đã Nhận Tiền', {
          body: 'Khoản chuyển tiền đã được người nhận xác nhận thành công!'
        });
      } else if (event.eventType === 'activity.created') {
        toast.info('Vừa có hoạt động chi tiêu mới được thêm!');
        showWebNotification('Sổ Nợ Nghĩa Tình: Chi Tiêu Mới', {
          body: 'Vừa có hoạt động chi tiêu mới được thêm vào nhóm của bạn!'
        });
      }
    },
    [fetchAllData]
  );

  const { isConnected } = useRealtime(currentGroupCode, currentMember?.id || null, {
    onEvent: handleRealtimeEvent,
    onWakeup: fetchAllData
  });

  const handleSelectGroup = (code: string) => {
    setCurrentGroupCode(code);
    window.history.pushState({}, '', `/group/${code}`);
  };

  const handleBackToHome = () => {
    setCurrentGroupCode(null);
    window.history.pushState({}, '', '/');
  };

  const handleSelectMember = (member: { id: string; name: string; status: string }) => {
    setCurrentMember(member);
    localStorage.setItem('tinhtien_current_member', JSON.stringify(member));
    if (currentGroupCode) {
      api.joinGroup(currentGroupCode, member.id);
      fetchAllData();
    }
  };

  const handleShareLink = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    toast.success('Đã sao chép link nhóm để chia sẻ!');
  };

  const handleOpenPayment = (recipientId?: string, defaultAmount?: number) => {
    setPaymentRecipientId(recipientId || null);
    setPaymentDefaultAmount(defaultAmount);
    setIsPaymentModalOpen(true);
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;

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
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-3 sm:px-4 py-2">
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
                  className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                    isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'
                  }`}
                  title={isConnected ? 'Đang kết nối Realtime' : 'Mất kết nối'}
                />
              </div>
              <button
                onClick={handleShareLink}
                className="text-[10px] text-slate-500 hover:text-emerald-600 flex items-center space-x-1 transition"
              >
                <span>Mã: {currentGroupCode}</span>
                <Copy className="w-2.5 h-2.5" />
              </button>
            </div>
          </div>

          <div className="flex items-center space-x-1 sm:space-x-1.5 flex-shrink-0">
            {/* Member selector pill */}
            <button
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

            {/* Notification bell */}
            <button
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
      <main className="flex-1 max-w-2xl w-full mx-auto p-4 sm:p-5">
        {activeTab === 'DASHBOARD' && (
          <DashboardView
            data={dashboardData}
            currentTheme={currentTheme}
            onOpenPaymentModal={handleOpenPayment}
            onOpenCreateActivity={() => setIsCreateActivityOpen(true)}
            onConfirmPayment={(pId) => {
              api.confirmPayment(currentGroupCode, currentMember?.id || 'anonymous', pId).then(() => fetchAllData());
            }}
            onRejectPayment={(pId) => {
              const reason = window.prompt('Nhập lý do từ chối:');
              if (reason && reason.trim()) {
                api.rejectPayment(currentGroupCode, currentMember?.id || 'anonymous', pId, reason.trim()).then(() => fetchAllData());
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
          />
        )}

        {activeTab === 'PAYMENTS' && (
          <PaymentsView
            groupCode={currentGroupCode}
            currentMemberId={currentMember?.id}
            payments={payments}
            onRefresh={fetchAllData}
          />
        )}

        {activeTab === 'MEMBERS' && (
          <MembersView
            groupCode={currentGroupCode}
            currentMemberId={currentMember?.id}
            members={members}
            onRefresh={fetchAllData}
            isOpenAddModal={isAddMemberOpen}
            onCloseAddModal={() => setIsAddMemberOpen(!isAddMemberOpen)}
            onOpenBankConfig={(m) => setBankConfigMember(m)}
            onOpenThemePicker={(m) => {
              setProfileTargetMember(m);
              setIsProfileModalOpen(true);
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

      {/* Bottom Mobile Navigation Bar */}
      <nav className="sticky bottom-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/80 px-2 py-2">
        <div className="max-w-2xl mx-auto flex items-center justify-around">
          <button
            onClick={() => setActiveTab('DASHBOARD')}
            style={activeTab === 'DASHBOARD' ? { color: currentTheme.hex } : undefined}
            className={`flex flex-col items-center py-1 px-2.5 rounded-2xl transition ${
              activeTab === 'DASHBOARD' ? 'font-bold' : 'text-slate-400 font-medium hover:text-slate-600'
            }`}
          >
            <LayoutDashboard className="w-5 h-5 mb-0.5" />
            <span className="text-[10px]">Tổng quan</span>
          </button>

          <button
            onClick={() => setActiveTab('ACTIVITIES')}
            style={activeTab === 'ACTIVITIES' ? { color: currentTheme.hex } : undefined}
            className={`flex flex-col items-center py-1 px-2.5 rounded-2xl transition ${
              activeTab === 'ACTIVITIES' ? 'font-bold' : 'text-slate-400 font-medium hover:text-slate-600'
            }`}
          >
            <Receipt className="w-5 h-5 mb-0.5" />
            <span className="text-[10px]">Khoản chi</span>
          </button>

          {/* Center Quick Add FAB */}
          <button
            onClick={() => setIsCreateActivityOpen(true)}
            className="w-12 h-12 -mt-5 rounded-full text-white flex items-center justify-center shadow-md active:scale-90 transition transform"
            style={{ backgroundColor: currentTheme.hex }}
            title="Thêm khoản chi tiêu"
          >
            <Plus className="w-6 h-6 stroke-[2.5]" />
          </button>

          <button
            onClick={() => setActiveTab('DEBTS')}
            style={activeTab === 'DEBTS' ? { color: currentTheme.hex } : undefined}
            className={`flex flex-col items-center py-1 px-2.5 rounded-2xl transition ${
              activeTab === 'DEBTS' ? 'font-bold' : 'text-slate-400 font-medium hover:text-slate-600'
            }`}
          >
            <Scale className="w-5 h-5 mb-0.5" />
            <span className="text-[10px]">Công nợ</span>
          </button>

          <button
            onClick={() => setActiveTab('PAYMENTS')}
            style={activeTab === 'PAYMENTS' ? { color: currentTheme.hex } : undefined}
            className={`flex flex-col items-center py-1 px-2.5 rounded-2xl transition ${
              activeTab === 'PAYMENTS' ? 'font-bold' : 'text-slate-400 font-medium hover:text-slate-600'
            }`}
          >
            <CreditCard className="w-5 h-5 mb-0.5" />
            <span className="text-[10px]">Thanh toán</span>
          </button>

          <button
            onClick={() => setActiveTab('MEMBERS')}
            style={activeTab === 'MEMBERS' ? { color: currentTheme.hex } : undefined}
            className={`flex flex-col items-center py-1 px-2.5 rounded-2xl transition ${
              activeTab === 'MEMBERS' ? 'font-bold' : 'text-slate-400 font-medium hover:text-slate-600'
            }`}
          >
            <Users className="w-5 h-5 mb-0.5" />
            <span className="text-[10px]">Thành viên</span>
          </button>
        </div>
      </nav>

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
        onPaymentSuccess={fetchAllData}
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
      />
    </div>
  );
}
