import React, { useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  RotateCcw,
  AlertCircle
} from 'lucide-react';
import { formatVND, formatDateTime } from '../../utils/format.js';
import { Modal } from '../../components/common/Modal.js';
import { api } from '../../services/api.js';
import { toast } from 'sonner';
import confetti from 'canvas-confetti';

interface PaymentsViewProps {
  groupCode: string;
  currentMemberId?: string | null;
  payments: any[];
  onRefresh: () => void;
}

export const PaymentsView: React.FC<PaymentsViewProps> = ({
  groupCode,
  currentMemberId,
  payments,
  onRefresh
}) => {
  const [rejectingPaymentId, setRejectingPaymentId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleConfirm = async (paymentId: string) => {
    setIsSubmitting(true);
    const res = await api.confirmPayment(groupCode, currentMemberId || 'anonymous', paymentId);
    setIsSubmitting(false);

    if (res.success) {
      confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.7 }
      });
      toast.success('Đã xác nhận nhận tiền thành công');
      onRefresh();
    } else {
      toast.error(res.error || 'Không thể xác nhận');
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      toast.error('Vui lòng nhập lý do từ chối');
      return;
    }
    if (!rejectingPaymentId) return;

    setIsSubmitting(true);
    const res = await api.rejectPayment(
      groupCode,
      currentMemberId || 'anonymous',
      rejectingPaymentId,
      rejectReason.trim()
    );
    setIsSubmitting(false);

    if (res.success) {
      toast.success('Đã từ chối giao dịch');
      setRejectingPaymentId(null);
      setRejectReason('');
      onRefresh();
    } else {
      toast.error(res.error || 'Không thể từ chối');
    }
  };

  const handleCancel = async (paymentId: string) => {
    setIsSubmitting(true);
    const res = await api.cancelPayment(groupCode, currentMemberId || 'anonymous', paymentId);
    setIsSubmitting(false);

    if (res.success) {
      toast.success('Đã hủy yêu cầu thanh toán');
      onRefresh();
    } else {
      toast.error(res.error || 'Không thể hủy yêu cầu');
    }
  };

  return (
    <div className="space-y-4 pb-20">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
          Lịch sử thanh toán ({payments.length})
        </h3>
      </div>

      {payments.length === 0 ? (
        <div className="bg-white p-8 rounded-3xl border border-slate-200 text-center space-y-2">
          <Clock className="w-10 h-10 text-slate-300 mx-auto" />
          <h4 className="text-sm font-bold text-slate-700">Chưa có giao dịch thanh toán nào</h4>
          <p className="text-xs text-slate-400">Các lần chuyển tiền trả nợ sẽ được lưu đầy đủ tại đây.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {payments.map((p) => {
            const isPending = p.status === 'PENDING_CONFIRMATION';
            const isConfirmed = p.status === 'CONFIRMED';
            const isRejected = p.status === 'REJECTED';
            const isCancelled = p.status === 'CANCELLED';

            const recipientNames = p.allocations?.map((a: any) => a.recipient_name).join(', ') || 'Thành viên';
            const isMePayer = currentMemberId === p.payer_member_id;
            const isMeRecipient = p.allocations?.some((a: any) => a.recipient_member_id === currentMemberId);

            return (
              <div
                key={p.id}
                className={`p-4 rounded-3xl border transition shadow-sm ${
                  isPending
                    ? 'bg-amber-50/50 border-amber-200'
                    : isConfirmed
                    ? 'bg-white border-slate-200/80'
                    : 'bg-slate-50 border-slate-200 opacity-75'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-800">
                      <span>{p.payer_name}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                      <span>{recipientNames}</span>
                    </div>

                    <div className="text-xs text-slate-400 mt-0.5">{formatDateTime(p.created_at)}</div>

                    {isRejected && p.rejection_reason && (
                      <div className="text-xs text-rose-600 mt-1 flex items-center space-x-1">
                        <AlertCircle className="w-3 h-3" />
                        <span>Lý do từ chối: {p.rejection_reason}</span>
                      </div>
                    )}
                  </div>

                  <div className="text-right">
                    <div className="text-base font-extrabold text-slate-900">{formatVND(p.total_amount)}</div>
                    <span
                      className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full mt-0.5 ${
                        isConfirmed
                          ? 'bg-emerald-100 text-emerald-700'
                          : isPending
                          ? 'bg-amber-100 text-amber-800 animate-pulse'
                          : isRejected
                          ? 'bg-rose-100 text-rose-700'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {isConfirmed
                        ? 'Đã xác nhận'
                        : isPending
                        ? 'Chờ người nhận'
                        : isRejected
                        ? 'Đã từ chối'
                        : 'Đã hủy'}
                    </span>
                  </div>
                </div>

                {/* Thao tác duyệt / từ chối / hủy khi đang PENDING */}
                {isPending && (
                  <div className="mt-3 pt-3 border-t border-amber-100 flex items-center justify-end space-x-2">
                    {isMeRecipient && (
                      <>
                        <button
                          onClick={() => handleConfirm(p.id)}
                          disabled={isSubmitting}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3.5 py-1.5 rounded-xl flex items-center space-x-1 shadow-sm transition"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Xác nhận đã nhận</span>
                        </button>
                        <button
                          onClick={() => setRejectingPaymentId(p.id)}
                          disabled={isSubmitting}
                          className="bg-slate-100 hover:bg-rose-50 text-rose-600 font-semibold text-xs px-3 py-1.5 rounded-xl transition"
                        >
                          Từ chối
                        </button>
                      </>
                    )}

                    {isMePayer && (
                      <button
                        onClick={() => handleCancel(p.id)}
                        disabled={isSubmitting}
                        className="text-slate-500 hover:text-slate-700 text-xs font-semibold px-2 py-1"
                      >
                        Hủy yêu cầu
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal từ chối thanh toán kèm lý do (BR-12) */}
      <Modal
        isOpen={Boolean(rejectingPaymentId)}
        onClose={() => setRejectingPaymentId(null)}
        title="Từ chối xác nhận thanh toán"
      >
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            Khi từ chối, công nợ sẽ không bị giảm trừ. Bạn cần ghi rõ lý do để người chuyển tiền nắm được thông tin (ví dụ: chưa nhận được tiền trong tài khoản, sai số tiền,...).
          </p>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Lý do từ chối (bắt buộc) *
            </label>
            <input
              type="text"
              placeholder="Ví dụ: Chưa thấy tiền vào tài khoản ngân hàng..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-rose-500"
            />
          </div>

          <div className="flex space-x-2 pt-2">
            <button
              onClick={() => setRejectingPaymentId(null)}
              className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl text-xs transition"
            >
              Quay lại
            </button>
            <button
              onClick={handleReject}
              disabled={isSubmitting || !rejectReason.trim()}
              className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold py-2.5 rounded-xl text-xs transition disabled:opacity-50"
            >
              {isSubmitting ? 'Đang xử lý...' : 'Xác nhận từ chối'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
