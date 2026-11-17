import React from 'react';
import {
  ArrowUpRight,
  ArrowDownLeft,
  Plus,
  CheckCircle2,
  XCircle,
  Sparkles,
  AlertCircle,
  Receipt,
  ArrowRight,
  Send
} from 'lucide-react';
import { formatVND } from '../../utils/format.js';
import { Avatar } from '../../components/common/Avatar.js';
import { type ThemeColor } from '../../utils/theme.js';
import confetti from 'canvas-confetti';

interface DashboardViewProps {
  data: any;
  currentTheme: ThemeColor;
  onOpenPaymentModal: (recipientId?: string, defaultAmount?: number) => void;
  onOpenCreateActivity: () => void;
  onConfirmPayment: (paymentId: string) => void;
  onRejectPayment: (paymentId: string) => void;
  onOpenSelectMember: () => void;
  onOpenBankConfig?: () => void;
  onOpenProfileModal?: () => void;
  onNavigateToActivities?: () => void;
  onNavigateToDebts?: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  data,
  currentTheme,
  onOpenPaymentModal,
  onOpenCreateActivity,
  onConfirmPayment,
  onRejectPayment,
  onOpenSelectMember,
  onOpenBankConfig,
  onOpenProfileModal,
  onNavigateToActivities,
  onNavigateToDebts
}) => {
  const { personal, group, netBalances, settlementProposals, recentActivities } = data || {};

  const handleConfirmWithConfetti = (paymentId: string) => {
    confetti({
      particleCount: 70,
      spread: 60,
      origin: { y: 0.7 }
    });
    onConfirmPayment(paymentId);
  };

  // Loading skeleton nếu chưa có dữ liệu
  if (!data) {
    return (
      <div className="space-y-4 pb-20 animate-pulse">
        <div className="bg-slate-200/70 h-52 rounded-3xl" />
        <div className="bg-slate-200/70 h-32 rounded-3xl" />
        <div className="bg-slate-200/70 h-40 rounded-3xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-20">
      {/* 1. Thẻ số dư cá nhân Sinh Động, Hiệu Ứng Màu Sắc Tương Tác */}
      {personal ? (
        <div
          className="rounded-3xl border p-5 relative overflow-hidden transition-all duration-300 shadow-md hover:shadow-lg"
          style={{
            background: `linear-gradient(135deg, ${currentTheme.hex}18 0%, #ffffff 50%, ${currentTheme.hex}0c 100%)`,
            borderColor: `${currentTheme.hex}40`
          }}
        >
          {/* Vòng sáng trang trí dịu nhẹ */}
          <div
            className="absolute -right-12 -top-12 w-44 h-44 rounded-full blur-3xl pointer-events-none transition-all duration-500"
            style={{ backgroundColor: `${currentTheme.hex}25` }}
          />
          <div
            className="absolute -left-12 -bottom-12 w-40 h-40 rounded-full blur-3xl pointer-events-none transition-all duration-500"
            style={{ backgroundColor: `${currentTheme.hex}15` }}
          />

          {/* Header cá nhân: Avatar, Tên */}
          <div className="flex items-center justify-between pb-3.5 border-b border-slate-200/60 relative z-10">
            <div className="flex items-center space-x-3">
              <Avatar
                name={personal.memberName}
                avatarUrl={personal.avatarUrl}
                size="md"
                className="ring-2 ring-white shadow-xs"
              />

              <div>
                <div className="flex items-center space-x-1.5">
                  <span className="text-sm font-extrabold text-slate-900">{personal.memberName}</span>
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white shadow-2xs"
                    style={{ backgroundColor: currentTheme.hex }}
                  >
                    Bạn
                  </span>
                </div>
                <span className="text-[11px] text-slate-400">Tài khoản thao tác</span>
              </div>
            </div>
          </div>

          {/* Số dư ròng trung tâm */}
          <div className="pt-4 pb-2 relative z-10">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Số dư ròng của bạn
              </span>
              {personal.netBalance > 0 ? (
                <span className="text-[11px] font-extrabold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200/80 shadow-2xs">
                  Được nhận lại
                </span>
              ) : personal.netBalance < 0 ? (
                <span className="text-[11px] font-extrabold px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200/80 shadow-2xs">
                  Cần thanh toán
                </span>
              ) : (
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
                  Đã cân bằng 0 đ
                </span>
              )}
            </div>

            <div className="text-3xl sm:text-4xl font-black mt-1.5 tracking-tight">
              {personal.netBalance > 0 ? (
                <span className="text-emerald-600">+{formatVND(personal.netBalance)}</span>
              ) : personal.netBalance < 0 ? (
                <span className="text-rose-600">-{formatVND(Math.abs(personal.netBalance))}</span>
              ) : (
                <span className="text-slate-800">0 đ</span>
              )}
            </div>
          </div>

          {/* 2 chỉ số phụ cân bằng */}
          <div className="grid grid-cols-2 gap-2.5 mt-3 text-xs relative z-10">
            <div className="bg-white/90 backdrop-blur-xs p-3 rounded-2xl border border-slate-200/70 shadow-2xs">
              <div className="flex items-center space-x-1.5 text-slate-500 font-bold mb-0.5">
                <ArrowUpRight className="w-3.5 h-3.5 text-rose-500 stroke-[2.5]" />
                <span>Bạn cần trả</span>
              </div>
              <div className="text-base font-black text-rose-600">{formatVND(personal.totalOwedToOthers)}</div>
            </div>

            <div className="bg-white/90 backdrop-blur-xs p-3 rounded-2xl border border-slate-200/70 shadow-2xs">
              <div className="flex items-center space-x-1.5 text-slate-500 font-bold mb-0.5">
                <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600 stroke-[2.5]" />
                <span>Bạn được nhận</span>
              </div>
              <div className="text-base font-black text-emerald-600">{formatVND(personal.totalOwedByOthers)}</div>
            </div>
          </div>

          {/* Thao tác nhanh tinh gọn */}
          <div className="flex items-center space-x-2.5 mt-4 pt-3.5 border-t border-slate-200/60 relative z-10">
            {personal.totalOwedToOthers > 0 && (
              <button
                onClick={() => onOpenPaymentModal()}
                className="flex-1 bg-slate-900 hover:bg-slate-800 text-white font-extrabold py-3 px-3 rounded-2xl text-xs flex items-center justify-center space-x-1.5 shadow-sm transition active:scale-95"
              >
                <Send className="w-4 h-4 text-emerald-400" />
                <span>Báo đã trả tiền</span>
              </button>
            )}

            <button
              onClick={onOpenCreateActivity}
              className={`text-white font-extrabold py-3 px-3 rounded-2xl text-xs flex items-center justify-center space-x-1.5 shadow-md transition transform active:scale-95 ${
                personal.totalOwedToOthers > 0 ? 'flex-1' : 'w-full'
              }`}
              style={{ backgroundColor: currentTheme.hex }}
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>Thêm khoản chi</span>
            </button>
          </div>
        </div>
      ) : (
        /* Chưa chọn vai trò */
        <div className="bg-white border border-amber-200/90 p-4 rounded-3xl flex items-center justify-between shadow-xs">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 flex items-center justify-center flex-shrink-0">
              <AlertCircle className="w-5 h-5 text-amber-700" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-800">Bạn chưa chọn tên trong nhóm</h4>
              <p className="text-[11px] text-slate-500">Chọn tên để xem công nợ cá nhân và ghi nhận trả tiền.</p>
            </div>
          </div>
          <button
            onClick={onOpenSelectMember}
            className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-3.5 py-2 rounded-xl whitespace-nowrap shadow-xs active:scale-95"
          >
            Chọn tên
          </button>
        </div>
      )}

      {/* 2. Giao dịch cần bạn xác nhận */}
      {personal?.pendingReceived && personal.pendingReceived.length > 0 && (
        <div className="bg-white border border-amber-200 p-4 rounded-3xl shadow-xs space-y-2.5">
          <div className="flex items-center space-x-2 text-amber-800 font-bold text-xs uppercase tracking-wider">
            <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
            <span>Yêu cầu xác nhận nhận tiền ({personal.pendingReceived.length})</span>
          </div>

          <div className="space-y-2">
            {personal.pendingReceived.map((p: any) => (
              <div
                key={p.id}
                className="bg-slate-50/90 p-3 rounded-2xl border border-slate-100 flex items-center justify-between"
              >
                <div>
                  <div className="text-xs text-slate-500">
                    <span className="font-bold text-slate-800">{p.payer_name}</span> báo đã chuyển:
                  </div>
                  <div className="text-sm font-extrabold text-emerald-600">{formatVND(p.total_amount)}</div>
                </div>

                <div className="flex items-center space-x-1.5">
                  <button
                    onClick={() => handleConfirmWithConfetti(p.id)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3 py-1.5 rounded-xl flex items-center space-x-1 shadow-2xs transition"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Đã nhận</span>
                  </button>
                  <button
                    onClick={() => onRejectPayment(p.id)}
                    className="bg-white hover:bg-slate-100 text-rose-600 font-semibold text-xs px-2.5 py-1.5 rounded-xl border border-slate-200 transition"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. Người bạn cần chuyển tiền */}
      {personal?.peopleIOwe && personal.peopleIOwe.length > 0 && (
        <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200/80 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Người bạn cần chuyển tiền ({personal.peopleIOwe.length})
            </h4>
            <span className="text-xs font-bold text-rose-600 bg-rose-50 px-2.5 py-0.5 rounded-full border border-rose-100">
              Tổng nợ: {formatVND(personal.totalOwedToOthers)}
            </span>
          </div>

          <div className="space-y-1.5">
            {personal.peopleIOwe.map((item: any) => (
              <div
                key={item.creditorId}
                className="p-3 rounded-2xl bg-slate-50/70 border border-slate-100 flex items-center justify-between"
              >
                <div className="flex items-center space-x-3">
                  <Avatar name={item.creditorName} avatarUrl={item.avatarUrl} size="sm" />
                  <div>
                    <div className="font-bold text-slate-800 text-xs">{item.creditorName}</div>
                    <div className="text-xs font-extrabold text-rose-500">Cần trả: {formatVND(item.amount)}</div>
                  </div>
                </div>

                <button
                  onClick={() => onOpenPaymentModal(item.creditorId, item.amount)}
                  className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs px-3 py-1.5 rounded-xl flex items-center space-x-1.5 transition active:scale-95 shadow-2xs"
                >
                  <Send className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Báo trả</span>
                </button>
              </div>
            ))}
          </div>

          {onNavigateToDebts && (
            <button
              type="button"
              onClick={onNavigateToDebts}
              className="w-full pt-1.5 text-center text-[11px] font-bold text-slate-500 hover:text-slate-800 flex items-center justify-center space-x-1 transition"
            >
              <Receipt className="w-3 h-3 text-slate-400" />
              <span>Xem sổ đối chiếu cộng trừ chi tiết →</span>
            </button>
          )}
        </div>
      )}

      {/* 4. Những người đang nợ bạn */}
      {personal?.peopleOweMe && personal.peopleOweMe.length > 0 && (
        <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200/80 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Những người đang nợ bạn ({personal.peopleOweMe.length})
            </h4>
            <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-100">
              Chờ nhận: {formatVND(personal.totalOwedByOthers)}
            </span>
          </div>

          <div className="space-y-1.5">
            {personal.peopleOweMe.map((item: any) => (
              <div
                key={item.debtorId}
                className="p-3 rounded-2xl bg-slate-50/70 border border-slate-100 flex items-center justify-between"
              >
                <div className="flex items-center space-x-3">
                  <Avatar name={item.debtorName} avatarUrl={item.avatarUrl} size="sm" />
                  <div>
                    <div className="font-bold text-slate-800 text-xs">{item.debtorName}</div>
                    <div className="text-[11px] text-slate-400">cần chuyển lại cho bạn</div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-xs font-extrabold text-emerald-600">+{formatVND(item.amount)}</div>
                  <span className="text-[10px] text-slate-400">chưa trả</span>
                </div>
              </div>
            ))}
          </div>

          {onNavigateToDebts && (
            <button
              type="button"
              onClick={onNavigateToDebts}
              className="w-full pt-1.5 text-center text-[11px] font-bold text-slate-500 hover:text-slate-800 flex items-center justify-center space-x-1 transition"
            >
              <Receipt className="w-3 h-3 text-slate-400" />
              <span>Xem sổ đối chiếu cộng trừ chi tiết →</span>
            </button>
          )}
        </div>
      )}

      {/* 5. Hoạt động chi tiêu gần đây */}
      {recentActivities && recentActivities.length > 0 && (
        <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200/80 shadow-xs space-y-3">
          <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
            <div className="flex items-center space-x-2">
              <div
                className="w-6 h-6 rounded-lg flex items-center justify-center shadow-2xs"
                style={{ backgroundColor: `${currentTheme.hex}20` }}
              >
                <Receipt className="w-3.5 h-3.5" style={{ color: currentTheme.hex }} />
              </div>
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Hoạt động gần đây
              </h4>
            </div>
            {onNavigateToActivities && (
              <button
                onClick={onNavigateToActivities}
                className="text-xs font-bold text-slate-600 hover:text-slate-900 flex items-center space-x-1"
              >
                <span>Xem tất cả</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="divide-y divide-slate-100">
            {recentActivities.map((act: any) => (
              <div key={act.id} className="py-2.5 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-slate-800">{act.title}</div>
                  <div className="text-[11px] text-slate-400">
                    {new Date(act.occurred_at).toLocaleDateString('vi-VN', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric'
                    })}
                  </div>
                </div>
                <div className="text-xs font-extrabold text-slate-900">{formatVND(act.total_amount)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 6. Gợi ý chuyển tiền tối giản */}
      {settlementProposals && settlementProposals.length > 0 && (
        <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200/80 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1.5 text-slate-800 font-bold text-xs uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Gợi ý chuyển tiền tối giản</span>
            </div>
            <span className="text-[11px] bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded-full">
              {settlementProposals.length} giao dịch
            </span>
          </div>

          <p className="text-[11px] text-slate-400">
            Phương án giảm tối đa số lần chuyển khoản cho toàn nhóm:
          </p>

          <div className="space-y-1.5">
            {settlementProposals.map((prop: any, idx: number) => (
              <div
                key={idx}
                className="bg-slate-50/80 p-2.5 rounded-2xl border border-slate-100 flex items-center justify-between text-xs"
              >
                <div className="flex items-center space-x-1.5">
                  <span className="font-bold text-slate-800">{prop.fromMemberName}</span>
                  <span className="text-slate-400 text-xs">→</span>
                  <span className="font-bold text-slate-800">{prop.toMemberName}</span>
                </div>
                <span className="font-extrabold text-slate-900">{formatVND(prop.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 7. Tổng quan toàn nhóm */}
      <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200/80 shadow-xs space-y-3">
        <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
          <div>
            <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Tổng quan nhóm</h4>
            <div className="text-base font-extrabold text-slate-900 mt-0.5">{group?.name}</div>
          </div>
          <div className="text-right">
            <span className="text-[11px] text-slate-400 block">Tổng quỹ chi tiêu</span>
            <span className="text-sm font-extrabold text-slate-900">{formatVND(group?.totalExpense)}</span>
          </div>
        </div>

        {/* Danh sách số dư thành viên */}
        <div className="space-y-2">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
            Số dư ròng các thành viên
          </span>
          {netBalances?.map((m: any) => (
            <div key={m.memberId} className="flex items-center justify-between text-xs py-1">
              <div className="flex items-center space-x-2.5">
                <Avatar name={m.memberName} avatarUrl={m.avatarUrl} size="xs" />
                <span className="font-semibold text-slate-700">{m.memberName}</span>
              </div>

              <div className="font-extrabold text-xs">
                {m.netBalance > 0 ? (
                  <span className="text-emerald-600">+{formatVND(m.netBalance)}</span>
                ) : m.netBalance < 0 ? (
                  <span className="text-rose-500">-{formatVND(Math.abs(m.netBalance))}</span>
                ) : (
                  <span className="text-slate-400">0 đ</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
