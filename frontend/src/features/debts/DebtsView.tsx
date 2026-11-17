import React, { useState } from 'react';
import { ArrowRight, Send, Plus, FileText, CheckCircle2, History, Receipt } from 'lucide-react';
import { formatVND, getInitials, formatDateTime } from '../../utils/format.js';
import { getMemberTheme } from '../../utils/theme.js';
import { Modal } from '../../components/common/Modal.js';
import { PairwiseDebtDetailModal } from './PairwiseDebtDetailModal.js';
import { api } from '../../services/api.js';
import { toast } from 'sonner';

interface Member {
  id: string;
  name: string;
  status: string;
}

interface DebtsViewProps {
  groupCode: string;
  currentMemberId?: string | null;
  members: Member[];
  debtsData: any;
  onRefresh: () => void;
  onOpenPaymentModal: (recipientId?: string, defaultAmount?: number) => void;
}

export const DebtsView: React.FC<DebtsViewProps> = ({
  groupCode,
  currentMemberId,
  members,
  debtsData,
  onRefresh,
  onOpenPaymentModal
}) => {
  const [activeTab, setActiveTab] = useState<'PAIRWISE' | 'OBLIGATIONS'>('PAIRWISE');
  const [isInitialDebtModalOpen, setIsInitialDebtModalOpen] = useState(false);
  const [selectedPair, setSelectedPair] = useState<any | null>(null);

  // Form nhập nợ ban đầu
  const [debtorId, setDebtorId] = useState(members[0]?.id || '');
  const [creditorId, setCreditorId] = useState(members[1]?.id || '');
  const [initialAmount, setInitialAmount] = useState<number | ''>('');
  const [initialNote, setInitialNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { pairwiseDebts = [], obligations = [] } = debtsData || {};
  const activeMembers = members.filter((m) => m.status === 'ACTIVE');

  // Lọc chỉ những cặp có nợ
  const activePairwise = pairwiseDebts.filter((p: any) => p.netAmount > 0);

  const handleCreateInitialDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (debtorId === creditorId) {
      toast.error('Người nợ và người nhận không thể trùng nhau');
      return;
    }
    const amt = Number(initialAmount);
    if (!amt || amt <= 0) {
      toast.error('Vui lòng nhập số tiền hợp lệ');
      return;
    }

    setIsSubmitting(true);
    const res = await api.importInitialDebts(groupCode, currentMemberId || debtorId, [
      {
        debtorMemberId: debtorId,
        creditorMemberId: creditorId,
        amount: amt,
        note: initialNote.trim() || undefined
      }
    ]);
    setIsSubmitting(false);

    if (res.success) {
      toast.success('Đã nhập công nợ ban đầu thành công');
      setIsInitialDebtModalOpen(false);
      setInitialAmount('');
      setInitialNote('');
      onRefresh();
    } else {
      toast.error(res.error || 'Không thể lưu công nợ');
    }
  };

  return (
    <div className="space-y-4 pb-20">
      {/* Tab Switcher & Import Button */}
      <div className="flex items-center justify-between">
        <div className="flex bg-slate-200/70 p-1 rounded-2xl text-xs font-bold">
          <button
            onClick={() => setActiveTab('PAIRWISE')}
            className={`px-3.5 py-1.5 rounded-xl transition ${
              activeTab === 'PAIRWISE' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            Số dư đối chiếu
          </button>
          <button
            onClick={() => setActiveTab('OBLIGATIONS')}
            className={`px-3.5 py-1.5 rounded-xl transition ${
              activeTab === 'OBLIGATIONS' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            Nợ gốc ({obligations.length})
          </button>
        </div>

        <button
          onClick={() => setIsInitialDebtModalOpen(true)}
          className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs px-3 py-2 rounded-xl flex items-center space-x-1.5 transition active:scale-95"
        >
          <Plus className="w-3.5 h-3.5 text-emerald-400" />
          <span>Nhập nợ cũ</span>
        </button>
      </div>

      {/* Tab 1: Công nợ hai chiều & Số dư ròng đối chiếu */}
      {activeTab === 'PAIRWISE' ? (
        activePairwise.length === 0 ? (
          <div className="bg-white p-8 rounded-3xl border border-slate-200 text-center space-y-2">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
            <h4 className="text-sm font-bold text-slate-800">Không có công nợ nào chưa thanh toán!</h4>
            <p className="text-xs text-slate-400">Tất cả thành viên trong nhóm hiện đang cân bằng 0 đ.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {activePairwise.map((item: any, idx: number) => {
              const debtorName = item.netDebtorId === item.memberAId ? item.memberAName : item.memberBName;
              const creditorName = item.netCreditorId === item.memberAId ? item.memberAName : item.memberBName;
              const isMeDebtor = currentMemberId === item.netDebtorId;

              return (
                <div
                  key={idx}
                  onClick={() => setSelectedPair(item)}
                  className={`bg-white p-3.5 rounded-2xl border transition shadow-2xs cursor-pointer hover:border-slate-300 ${
                    isMeDebtor ? 'border-rose-200/80 bg-rose-50/20' : 'border-slate-200/80'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      {/* Avatar debtor */}
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs text-white"
                        style={{ backgroundColor: getMemberTheme({ name: debtorName }).hex }}
                      >
                        {getInitials(debtorName)}
                      </div>

                      <div className="text-xs">
                        <div className="flex items-center space-x-1.5 font-bold text-slate-800">
                          <span>{debtorName}</span>
                          <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                          <span>{creditorName}</span>
                        </div>
                        <div className="text-slate-400 mt-0.5">
                          {item.aOwesB > 0 && item.bOwesA > 0 ? (
                            <span>
                              (Bù trừ 2 chiều: {formatVND(item.aOwesB)} và {formatVND(item.bOwesA)})
                            </span>
                          ) : (
                            <span>Công nợ trực tiếp</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2.5">
                      <div className="text-right">
                        <span className="text-sm font-extrabold text-rose-500 block">
                          {formatVND(item.netAmount)}
                        </span>
                        <span className="text-[10px] text-slate-400">còn nợ ròng</span>
                      </div>

                      {isMeDebtor && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenPaymentModal(item.netCreditorId, item.netAmount);
                          }}
                          className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs p-2 rounded-xl transition shadow-2xs"
                          title="Báo trả nợ"
                        >
                          <Send className="w-4 h-4 text-emerald-400" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                    <span className="flex items-center space-x-1">
                      <Receipt className="w-3 h-3 text-slate-400" />
                      <span>Xem sổ cộng trừ nợ chi tiết</span>
                    </span>
                    <span className="font-semibold text-slate-700 flex items-center space-x-0.5">
                      <span>Chi tiết</span>
                      <ArrowRight className="w-3 h-3" />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        /* Tab 2: Danh sách nghĩa vụ nợ gốc (Debt Obligations) */
        <div className="space-y-2">
          {obligations.map((ob: any) => {
            const isSettled = ob.status === 'FULLY_SETTLED';
            return (
              <div
                key={ob.id}
                className="bg-white p-3.5 rounded-2xl border border-slate-200/80 flex items-center justify-between text-xs"
              >
                <div>
                  <div className="flex items-center space-x-1.5">
                    <span className="font-bold text-slate-800">{ob.debtor_name}</span>
                    <span className="text-slate-400">nợ</span>
                    <span className="font-bold text-slate-800">{ob.creditor_name}</span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        ob.source_type === 'INITIAL_DEBT'
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}
                    >
                      {ob.source_type === 'INITIAL_DEBT' ? 'Nợ ban đầu' : 'Hoạt động'}
                    </span>
                  </div>
                  <div className="text-slate-400 mt-1">
                    Gốc: {formatVND(ob.original_amount)}
                    {ob.settled_amount > 0 && ` • Đã trả: ${formatVND(ob.settled_amount)}`}
                  </div>
                </div>

                <div className="text-right">
                  <div className={`font-bold ${isSettled ? 'text-slate-400 line-through' : 'text-rose-500'}`}>
                    Còn: {formatVND(ob.remainingAmount)}
                  </div>
                  <span
                    className={`text-[10px] font-semibold ${
                      isSettled ? 'text-emerald-600' : 'text-amber-600'
                    }`}
                  >
                    {isSettled ? 'Đã trả xong' : 'Đang nợ'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Nhập công nợ ban đầu (Section 4.8) */}
      <Modal
        isOpen={isInitialDebtModalOpen}
        onClose={() => setIsInitialDebtModalOpen(false)}
        title="Nhập công nợ cũ / ban đầu"
      >
        <form onSubmit={handleCreateInitialDebt} className="space-y-3.5">
          <p className="text-xs text-slate-500">
            Dùng để ghi nhận các khoản tiền đã nợ nhau trước khi nhóm bắt đầu sử dụng website này.
          </p>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Người nợ tiền *
            </label>
            <select
              value={debtorId}
              onChange={(e) => setDebtorId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-bold focus:outline-none focus:border-emerald-500"
            >
              {activeMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Người được nhận tiền *
            </label>
            <select
              value={creditorId}
              onChange={(e) => setCreditorId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-bold focus:outline-none focus:border-emerald-500"
            >
              {activeMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Số tiền nợ (VND) *
            </label>
            <input
              type="number"
              placeholder="Ví dụ: 150000"
              value={initialAmount}
              onChange={(e) => setInitialAmount(e.target.value ? Number(e.target.value) : '')}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-bold focus:outline-none focus:border-emerald-500"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Ghi chú (tùy chọn)
            </label>
            <input
              type="text"
              placeholder="Ví dụ: Tiền mua vé máy bay đợt trước..."
              value={initialNote}
              onChange={(e) => setInitialNote(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl text-sm transition active:scale-[0.98] disabled:opacity-50"
            >
              {isSubmitting ? 'Đang lưu...' : 'Lưu khoản nợ ban đầu'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Chi tiết đối chiếu nợ từng cá nhân */}
      <PairwiseDebtDetailModal
        isOpen={Boolean(selectedPair)}
        onClose={() => setSelectedPair(null)}
        pair={selectedPair}
        obligations={obligations}
        currentMemberId={currentMemberId}
        onOpenPaymentModal={onOpenPaymentModal}
      />
    </div>
  );
};
