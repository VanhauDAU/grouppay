import React from 'react';
import {
  ArrowUpRight,
  ArrowDownLeft,
  QrCode,
  Plus,
  CheckCircle2,
  XCircle,
  Sparkles,
  AlertCircle,
  Receipt,
  ArrowRight,
  Palette,
  Check
} from 'lucide-react';
import { formatVND, getInitials } from '../../utils/format.js';
import { getMemberTheme, type ThemeColor } from '../../utils/theme.js';
import confetti from 'canvas-confetti';

interface DashboardViewProps {
  data: any;
  currentTheme: ThemeColor;
  onOpenPaymentModal: (recipientId?: string, defaultAmount?: number) => void;
  onOpenCreateActivity: () => void;
  onConfirmPayment: (paymentId: string) => void;
  onRejectPayment: (paymentId: string) => void;
  onOpenSelectMember: () => void;
  onOpenBankConfig: () => void;
  onOpenThemePicker: () => void;
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
  onOpenThemePicker,
  onNavigateToActivities,
  onNavigateToDebts
}) => {
  const { personal, group, netBalances, settlementProposals, recentActivities } = data || {};

  const handleConfirmWithConfetti = (paymentId: string) => {
    confetti({
      particleCount: 60,
      spread: 50,
      origin: { y: 0.7 }
    });
    onConfirmPayment(paymentId);
  };

  return (
    <div className="space-y-4 pb-20">
      {/* 1. Thẻ số dư cá nhân (Thiết kế phẳng, tinh tế, không chói mắt) */}
      {personal ? (
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs p-5 relative overflow-hidden transition">
          {/* Header cá nhân: Avatar, Tên, Nút đổi màu & Đổi vai trò */}
          <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
            <div className="flex items-center space-x-3">
              <button
                type="button"
                onClick={onOpenThemePicker}
                title="Bấm để đổi màu chủ đạo của bạn"
                className="relative group focus:outline-none"
              >
                <div
                  className="w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-xs text-white shadow-xs transition group-hover:scale-105"
                  style={{ backgroundColor: currentTheme.hex }}
                >
                  {getInitials(personal.memberName)}
                </div>
                <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-white border border-slate-200 flex items-center justify-center shadow-2xs">
                  <Palette className="w-2.5 h-2.5 text-slate-600" />
                </div>
              </button>

              <div>
                <div className="flex items-center space-x-1.5">
                  <span className="text-sm font-bold text-slate-800">{personal.memberName}</span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                    Bạn
                  </span>
                </div>
                <span className="text-[11px] text-slate-400">Tài khoản thao tác</span>
              </div>
            </div>

            <div className="flex items-center space-x-1.5">
              <button
                onClick={onOpenThemePicker}
                className="text-xs font-semibold px-2.5 py-1.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center space-x-1 transition"
                title="Chọn màu chủ đạo"
              >
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: currentTheme.hex }} />
                <span className="hidden sm:inline">Màu</span>
              </button>

              <button
                onClick={onOpenSelectMember}
                className="text-xs font-semibold px-2.5 py-1.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition"
              >
                Đổi vai trò
              </button>
            </div>
          </div>

          {/* Số dư ròng trung tâm */}
          <div className="pt-4 pb-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Số dư ròng của bạn
              </span>
              {personal.netBalance > 0 ? (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                  Được nhận lại
                </span>
              ) : personal.netBalance < 0 ? (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200/80">
                  Cần thanh toán
                </span>
              ) : (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                  Đã cân bằng
                </span>
              )}
            </div>

            <div className="text-3xl font-black mt-1.5 tracking-tight">
              {personal.netBalance > 0 ? (
                <span className="text-emerald-600">+{formatVND(personal.netBalance)}</span>
              ) : personal.netBalance < 0 ? (
                <span className="text-rose-500">-{formatVND(Math.abs(personal.netBalance))}</span>
              ) : (
                <span className="text-slate-700">0 đ</span>
              )}
            </div>
          </div>

          {/* 2 chỉ số phụ gọn gàng */}
          <div className="grid grid-cols-2 gap-2.5 mt-3 text-xs">
            <div className="bg-slate-50/80 p-3 rounded-2xl border border-slate-100">
              <div className="flex items-center space-x-1.5 text-slate-500 font-semibold mb-0.5">
                <ArrowUpRight className="w-3.5 h-3.5 text-rose-500" />
                <span>Bạn cần trả</span>
              </div>
              <div className="text-sm font-bold text-slate-800">{formatVND(personal.totalOwedToOthers)}</div>
            </div>

            <div className="bg-slate-50/80 p-3 rounded-2xl border border-slate-100">
              <div className="flex items-center space-x-1.5 text-slate-500 font-semibold mb-0.5">
                <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600" />
                <span>Bạn được nhận</span>
              </div>
              <div className="text-sm font-bold text-slate-800">{formatVND(personal.totalOwedByOthers)}</div>
            </div>
          </div>

          {/* Thao tác nhanh tinh gọn */}
          <div className="grid grid-cols-2 gap-2.5 mt-4 pt-3.5 border-t border-slate-100">
            {personal.totalOwedToOthers > 0 ? (
              <button
                onClick={() => onOpenPaymentModal()}
                className="bg-slate-900 hover:bg-slate-800 text-white font-bold py-2.5 px-3 rounded-2xl text-xs flex items-center justify-center space-x-1.5 shadow-xs transition active:scale-95"
              >
                <QrCode className="w-4 h-4 text-emerald-400" />
                <span>Trả nợ VietQR</span>
              </button>
            ) : (
              <button
                onClick={onOpenBankConfig}
                className="bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold py-2.5 px-3 rounded-2xl text-xs flex items-center justify-center space-x-1.5 border border-slate-200/80 transition active:scale-95"
              >
                <QrCode className="w-4 h-4 text-slate-500" />
                <span>Cài đặt VietQR</span>
              </button>
            )}

            <button
              onClick={onOpenCreateActivity}
              className="text-white font-bold py-2.5 px-3 rounded-2xl text-xs flex items-center justify-center space-x-1.5 shadow-xs transition active:scale-95"
              style={{ backgroundColor: currentTheme.hex }}
            >
              <Plus className="w-4 h-4" />
              <span>Thêm khoản chi</span>
            </button>
          </div>
        </div>
      ) : (
        /* Chưa chọn vai trò */
        <div className="bg-white border border-amber-200/90 p-4 rounded-3xl flex items-center justify-between shadow-2xs">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-2xl bg-amber-50 flex items-center justify-center flex-shrink-0">
              <AlertCircle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-800">Bạn chưa chọn tên trong nhóm</h4>
              <p className="text-[11px] text-slate-500">Chọn tên để xem công nợ cá nhân và tạo VietQR.</p>
            </div>
          </div>
          <button
            onClick={onOpenSelectMember}
            className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-3.5 py-2 rounded-xl whitespace-nowrap shadow-xs"
          >
            Chọn tên
          </button>
        </div>
      )}

      {/* 2. Giao dịch cần bạn xác nhận */}
      {personal?.pendingReceived && personal.pendingReceived.length > 0 && (
        <div className="bg-white border border-amber-200 p-4 rounded-3xl shadow-2xs space-y-2.5">
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
        <div className="bg-white p-4.5 rounded-3xl border border-slate-200/80 shadow-xs space-y-2.5">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Người bạn cần chuyển tiền ({personal.peopleIOwe.length})
            </h4>
            <span className="text-xs font-bold text-rose-600 bg-rose-50 px-2.5 py-0.5 rounded-full border border-rose-100">
              Tổng nợ: {formatVND(personal.totalOwedToOthers)}
            </span>
          </div>

          <div className="space-y-1.5">
            {personal.peopleIOwe.map((item: any) => {
              const itemTheme = getMemberTheme({ name: item.creditorName });
              return (
                <div
                  key={item.creditorId}
                  className="p-3 rounded-2xl bg-slate-50/70 border border-slate-100 flex items-center justify-between"
                >
                  <div className="flex items-center space-x-3">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs text-white"
                      style={{ backgroundColor: itemTheme.hex }}
                    >
                      {getInitials(item.creditorName)}
                    </div>
                    <div>
                      <div className="font-bold text-slate-800 text-xs">{item.creditorName}</div>
                      <div className="text-xs font-extrabold text-rose-500">Cần trả: {formatVND(item.amount)}</div>
                    </div>
                  </div>

                  <button
                    onClick={() => onOpenPaymentModal(item.creditorId, item.amount)}
                    className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs px-3 py-1.5 rounded-xl flex items-center space-x-1 transition active:scale-95"
                  >
                    <QrCode className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Chuyển</span>
                  </button>
                </div>
              );
            })}
          </div>

          {onNavigateToDebts && (
            <button
              type="button"
              onClick={onNavigateToDebts}
              className="w-full pt-1.5 text-center text-[11px] font-bold text-slate-500 hover:text-slate-800 flex items-center justify-center space-x-1"
            >
              <Receipt className="w-3 h-3 text-slate-400" />
              <span>Xem chi tiết cộng trừ các khoản nợ $\rightarrow$</span>
            </button>
          )}
        </div>
      )}

      {/* 4. Những người đang nợ bạn */}
      {personal?.peopleOweMe && personal.peopleOweMe.length > 0 && (
        <div className="bg-white p-4.5 rounded-3xl border border-slate-200/80 shadow-xs space-y-2.5">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Những người đang nợ bạn ({personal.peopleOweMe.length})
            </h4>
            <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-100">
              Chờ nhận: {formatVND(personal.totalOwedByOthers)}
            </span>
          </div>

          <div className="space-y-1.5">
            {personal.peopleOweMe.map((item: any) => {
              const itemTheme = getMemberTheme({ name: item.debtorName });
              return (
                <div
                  key={item.debtorId}
                  className="p-3 rounded-2xl bg-slate-50/70 border border-slate-100 flex items-center justify-between"
                >
                  <div className="flex items-center space-x-3">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs text-white"
                      style={{ backgroundColor: itemTheme.hex }}
                    >
                      {getInitials(item.debtorName)}
                    </div>
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
              );
            })}
          </div>

          {onNavigateToDebts && (
            <button
              type="button"
              onClick={onNavigateToDebts}
              className="w-full pt-1.5 text-center text-[11px] font-bold text-slate-500 hover:text-slate-800 flex items-center justify-center space-x-1"
            >
              <Receipt className="w-3 h-3 text-slate-400" />
              <span>Xem chi tiết cộng trừ các khoản nợ $\rightarrow$</span>
            </button>
          )}
        </div>
      )}

      {/* 5. Hoạt động chi tiêu gần đây (Gọn gàng, tinh tế) */}
      {recentActivities && recentActivities.length > 0 && (
        <div className="bg-white p-4.5 rounded-3xl border border-slate-200/80 shadow-xs space-y-2.5">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div className="flex items-center space-x-2">
              <Receipt className="w-4 h-4 text-slate-500" />
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
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

      {/* 6. Gợi ý chuyển tiền tối giản (Thiết kế nhẹ, tinh tế) */}
      {settlementProposals && settlementProposals.length > 0 && (
        <div className="bg-white p-4.5 rounded-3xl border border-slate-200/80 shadow-xs space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1.5 text-slate-700 font-bold text-xs uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Gợi ý chuyển tiền tối giản</span>
            </div>
            <span className="text-[11px] bg-slate-100 text-slate-700 font-semibold px-2 py-0.5 rounded-full">
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
                  <span className="text-slate-400 text-[11px]">$\rightarrow$</span>
                  <span className="font-bold text-slate-800">{prop.toMemberName}</span>
                </div>
                <span className="font-extrabold text-slate-900">{formatVND(prop.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 7. Tổng quan toàn nhóm */}
      <div className="bg-white p-4.5 rounded-3xl border border-slate-200/80 shadow-xs space-y-3">
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
          {netBalances?.map((m: any) => {
            const mTheme = getMemberTheme({ name: m.memberName });
            return (
              <div key={m.memberId} className="flex items-center justify-between text-xs py-1">
                <div className="flex items-center space-x-2.5">
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-[11px] text-white"
                    style={{ backgroundColor: mTheme.hex }}
                  >
                    {getInitials(m.memberName)}
                  </div>
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
            );
          })}
        </div>
      </div>
    </div>
  );
};
