import React from 'react';
import {
  ArrowUpRight,
  ArrowDownLeft,
  QrCode,
  Plus,
  CheckCircle2,
  XCircle,
  TrendingDown,
  Sparkles,
  AlertCircle,
  Receipt,
  ArrowRight
} from 'lucide-react';
import { formatVND, getInitials, getAvatarColor } from '../../utils/format.js';
import confetti from 'canvas-confetti';
import { toast } from 'sonner';

interface DashboardViewProps {
  data: any;
  onOpenPaymentModal: (recipientId?: string, defaultAmount?: number) => void;
  onOpenCreateActivity: () => void;
  onConfirmPayment: (paymentId: string) => void;
  onRejectPayment: (paymentId: string) => void;
  onOpenSelectMember: () => void;
  onOpenBankConfig: () => void;
  onNavigateToActivities?: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  data,
  onOpenPaymentModal,
  onOpenCreateActivity,
  onConfirmPayment,
  onRejectPayment,
  onOpenSelectMember,
  onOpenBankConfig,
  onNavigateToActivities
}) => {
  const { personal, group, netBalances, settlementProposals, recentActivities } = data || {};

  const handleConfirmWithConfetti = (paymentId: string) => {
    confetti({
      particleCount: 80,
      spread: 60,
      origin: { y: 0.7 }
    });
    onConfirmPayment(paymentId);
  };

  return (
    <div className="space-y-5 pb-20">
      {/* 1. Personal Balance Card (Thẻ số dư cá nhân) */}
      {personal ? (
        <div className="bg-gradient-to-br from-slate-900 via-navy-800 to-slate-900 text-white p-6 rounded-3xl shadow-xl shadow-slate-900/10 relative overflow-hidden">
          {/* Subtle decoration */}
          <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />

          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2.5">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs ${getAvatarColor(
                  personal.memberName
                )}`}
              >
                {getInitials(personal.memberName)}
              </div>
              <div>
                <span className="text-xs text-slate-400 block">Tài khoản của bạn</span>
                <span className="text-sm font-bold text-white">{personal.memberName}</span>
              </div>
            </div>

            <button
              onClick={onOpenSelectMember}
              className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 px-3 py-1.5 rounded-full transition"
            >
              Đổi vai trò
            </button>
          </div>

          {/* Số dư ròng */}
          <div className="my-3">
            <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Số dư ròng của bạn</span>
            <div className="text-3xl font-extrabold mt-1 tracking-tight">
              {personal.netBalance > 0 ? (
                <span className="text-emerald-400">+{formatVND(personal.netBalance)}</span>
              ) : personal.netBalance < 0 ? (
                <span className="text-rose-400">-{formatVND(Math.abs(personal.netBalance))}</span>
              ) : (
                <span className="text-slate-300">0 đ (Đã cân bằng)</span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              {personal.netBalance > 0
                ? 'Bạn đang được các thành viên khác nợ tiền'
                : personal.netBalance < 0
                ? 'Bạn đang có các khoản cần thanh toán'
                : 'Bạn không còn nợ ai và không ai nợ bạn'}
            </p>
          </div>

          {/* Hai con số chi tiết */}
          <div className="grid grid-cols-2 gap-3 pt-4 border-t border-slate-800 mt-4 text-xs">
            <div className="bg-slate-800/60 p-3 rounded-2xl">
              <div className="flex items-center space-x-1.5 text-rose-400 font-semibold mb-1">
                <ArrowUpRight className="w-3.5 h-3.5" />
                <span>Bạn cần trả</span>
              </div>
              <div className="text-base font-bold text-white">{formatVND(personal.totalOwedToOthers)}</div>
            </div>

            <div className="bg-slate-800/60 p-3 rounded-2xl">
              <div className="flex items-center space-x-1.5 text-emerald-400 font-semibold mb-1">
                <ArrowDownLeft className="w-3.5 h-3.5" />
                <span>Bạn được nhận</span>
              </div>
              <div className="text-base font-bold text-white">{formatVND(personal.totalOwedByOthers)}</div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-2 gap-2.5 mt-4">
            {personal.totalOwedToOthers > 0 ? (
              <button
                onClick={() => onOpenPaymentModal()}
                className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 px-4 rounded-2xl text-xs flex items-center justify-center space-x-2 shadow-lg shadow-emerald-500/25 transition active:scale-95"
              >
                <QrCode className="w-4 h-4" />
                <span>Trả nợ ngay (VietQR)</span>
              </button>
            ) : (
              <button
                onClick={onOpenBankConfig}
                className="bg-slate-800 hover:bg-slate-700 text-emerald-400 font-bold py-3 px-4 rounded-2xl text-xs flex items-center justify-center space-x-2 transition active:scale-95"
              >
                <QrCode className="w-4 h-4" />
                <span>Cài đặt VietQR nhận tiền</span>
              </button>
            )}

            <button
              onClick={onOpenCreateActivity}
              className="bg-white/10 hover:bg-white/15 text-white font-bold py-3 px-4 rounded-2xl text-xs flex items-center justify-center space-x-2 transition active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>Thêm hoạt động chi tiêu</span>
            </button>
          </div>
        </div>
      ) : (
        /* Chưa chọn vai trò */
        <div className="bg-amber-50 border border-amber-200 p-5 rounded-3xl flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <AlertCircle className="w-6 h-6 text-amber-600 flex-shrink-0" />
            <div>
              <h4 className="text-sm font-bold text-amber-900">Bạn chưa chọn tên của mình</h4>
              <p className="text-xs text-amber-700">Chọn tên để xem công nợ cá nhân và nhận chuyển khoản.</p>
            </div>
          </div>
          <button
            onClick={onOpenSelectMember}
            className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl whitespace-nowrap shadow-sm"
          >
            Chọn ngay
          </button>
        </div>
      )}

      {/* 2. Giao dịch cần bạn xác nhận (Pending Confirmations) */}
      {personal?.pendingReceived && personal.pendingReceived.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-3xl space-y-3">
          <div className="flex items-center space-x-2 text-amber-800 font-bold text-xs uppercase tracking-wider">
            <AlertCircle className="w-4 h-4 text-amber-600" />
            <span>Yêu cầu xác nhận chuyển khoản ({personal.pendingReceived.length})</span>
          </div>

          <div className="space-y-2">
            {personal.pendingReceived.map((p: any) => (
              <div
                key={p.id}
                className="bg-white p-3.5 rounded-2xl border border-amber-200 shadow-sm flex items-center justify-between"
              >
                <div>
                  <div className="text-xs text-slate-500">
                    <span className="font-bold text-slate-800">{p.payer_name}</span> báo đã chuyển:
                  </div>
                  <div className="text-base font-extrabold text-emerald-600">{formatVND(p.total_amount)}</div>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handleConfirmWithConfetti(p.id)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3.5 py-2 rounded-xl flex items-center space-x-1 shadow-sm transition"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Đã nhận</span>
                  </button>
                  <button
                    onClick={() => onRejectPayment(p.id)}
                    className="bg-slate-100 hover:bg-slate-200 text-rose-600 font-semibold text-xs px-3 py-2 rounded-xl transition"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. Danh sách người bạn cần trả (có nút trả nợ và VietQR từng người) */}
      {personal?.peopleIOwe && personal.peopleIOwe.length > 0 && (
        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm space-y-3">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Người bạn cần chuyển tiền ({personal.peopleIOwe.length})
          </h4>
          <div className="space-y-2">
            {personal.peopleIOwe.map((item: any) => (
              <div
                key={item.creditorId}
                className="p-3 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between"
              >
                <div className="flex items-center space-x-3">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs ${getAvatarColor(
                      item.creditorName
                    )}`}
                  >
                    {getInitials(item.creditorName)}
                  </div>
                  <div>
                    <div className="font-bold text-slate-800 text-sm">{item.creditorName}</div>
                    <div className="text-xs font-extrabold text-rose-500">Cần trả: {formatVND(item.amount)}</div>
                  </div>
                </div>

                <button
                  onClick={() => onOpenPaymentModal(item.creditorId, item.amount)}
                  className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs px-3.5 py-2 rounded-xl flex items-center space-x-1.5 transition active:scale-95"
                >
                  <QrCode className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Chuyển</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. Danh sách người đang nợ bạn */}
      {personal?.peopleOweMe && personal.peopleOweMe.length > 0 && (
        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Những người đang nợ bạn ({personal.peopleOweMe.length})
            </h4>
            <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
              Chờ nhận: {formatVND(personal.totalOwedByOthers)}
            </span>
          </div>
          <div className="space-y-2">
            {personal.peopleOweMe.map((item: any) => (
              <div
                key={item.debtorId}
                className="p-3.5 rounded-2xl bg-slate-50/80 border border-slate-100 flex items-center justify-between"
              >
                <div className="flex items-center space-x-3">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs ${getAvatarColor(
                      item.debtorName
                    )}`}
                  >
                    {getInitials(item.debtorName)}
                  </div>
                  <div>
                    <div className="font-bold text-slate-800 text-sm">{item.debtorName}</div>
                    <div className="text-xs text-slate-400">cần chuyển lại cho bạn</div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-sm font-extrabold text-emerald-600">+{formatVND(item.amount)}</div>
                  <span className="text-[10px] text-slate-400">chưa thanh toán</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. Hoạt động chi tiêu gần đây */}
      {recentActivities && recentActivities.length > 0 && (
        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center space-x-2">
              <Receipt className="w-4 h-4 text-emerald-600" />
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Hoạt động chi tiêu gần đây
              </h4>
            </div>
            {onNavigateToActivities && (
              <button
                onClick={onNavigateToActivities}
                className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center space-x-1 hover:underline"
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
                  <div className="text-sm font-bold text-slate-800">{act.title}</div>
                  <div className="text-[11px] text-slate-400">
                    {new Date(act.occurred_at).toLocaleDateString('vi-VN', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </div>
                </div>
                <div className="text-sm font-extrabold text-slate-900">{formatVND(act.total_amount)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 6. Đề xuất tối ưu chuyển khoản (Settlement Proposals) */}
      {settlementProposals && settlementProposals.length > 0 && (
        <div className="bg-gradient-to-br from-emerald-50 via-teal-50 to-emerald-50/40 p-5 rounded-3xl border border-emerald-200 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-emerald-900 font-bold text-xs uppercase tracking-wider">
              <Sparkles className="w-4 h-4 text-emerald-600" />
              <span>Gợi ý chuyển tiền tối giản</span>
            </div>
            <span className="text-xs bg-emerald-100 text-emerald-800 font-semibold px-2.5 py-0.5 rounded-full">
              Chỉ {settlementProposals.length} giao dịch
            </span>
          </div>

          <p className="text-xs text-emerald-800/80">
            Thay vì chuyển chéo nhiều lần, nhóm có thể tất toán toàn bộ công nợ bằng phương án sau:
          </p>

          <div className="space-y-2">
            {settlementProposals.map((prop: any, idx: number) => (
              <div
                key={idx}
                className="bg-white/90 backdrop-blur-sm p-3.5 rounded-2xl border border-emerald-200/60 shadow-xs flex items-center justify-between text-xs"
              >
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-slate-800">{prop.fromMemberName}</span>
                  <span className="text-slate-400">chuyển cho</span>
                  <span className="font-bold text-slate-800">{prop.toMemberName}</span>
                </div>
                <span className="font-extrabold text-emerald-600 text-sm">{formatVND(prop.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 7. Tổng quan toàn nhóm (Group Overview) */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Tổng quan toàn nhóm</h4>
            <div className="text-xl font-extrabold text-slate-900 mt-0.5">{group?.name}</div>
          </div>
          <div className="text-right">
            <span className="text-xs text-slate-400 block">Tổng quỹ chi tiêu</span>
            <span className="text-lg font-extrabold text-emerald-600">{formatVND(group?.totalExpense)}</span>
          </div>
        </div>

        {/* Bảng số dư các thành viên */}
        <div className="space-y-2.5">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
            Số dư ròng các thành viên
          </span>
          {netBalances?.map((m: any) => (
            <div key={m.memberId} className="flex items-center justify-between text-xs py-1">
              <div className="flex items-center space-x-2.5">
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs ${getAvatarColor(
                    m.memberName
                  )}`}
                >
                  {getInitials(m.memberName)}
                </div>
                <span className="font-bold text-slate-700">{m.memberName}</span>
              </div>

              <div className="font-extrabold text-sm">
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
