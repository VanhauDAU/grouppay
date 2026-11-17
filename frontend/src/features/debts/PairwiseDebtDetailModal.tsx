import React, { useState } from 'react';
import {
  ArrowRight,
  QrCode,
  Plus,
  Minus,
  Equal,
  CheckCircle2,
  Receipt,
  Calendar,
  AlertCircle,
  HelpCircle
} from 'lucide-react';
import { Modal } from '../../components/common/Modal.js';
import { formatVND, getInitials, formatDateTime } from '../../utils/format.js';
import { getMemberTheme } from '../../utils/theme.js';

interface ObligationItem {
  id: string;
  debtorMemberId: string;
  creditorMemberId: string;
  debtorName: string;
  creditorName: string;
  originalAmount: number;
  settledAmount: number;
  remainingAmount: number;
  sourceType: string;
  activityTitle?: string;
  activityOccurredAt?: string;
  createdAt: string;
  status: string;
}

interface PairwiseItem {
  memberAId: string;
  memberAName: string;
  memberBId: string;
  memberBName: string;
  aOwesB: number;
  bOwesA: number;
  netDebtorId: string | null;
  netCreditorId: string | null;
  netAmount: number;
}

interface PairwiseDebtDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  pair: PairwiseItem | null;
  obligations: ObligationItem[];
  currentMemberId?: string | null;
  onOpenPaymentModal?: (recipientId?: string, defaultAmount?: number) => void;
}

export const PairwiseDebtDetailModal: React.FC<PairwiseDebtDetailModalProps> = ({
  isOpen,
  onClose,
  pair,
  obligations,
  currentMemberId,
  onOpenPaymentModal
}) => {
  const [showSettled, setShowSettled] = useState(false);

  if (!pair) return null;

  const { memberAId, memberAName, memberBId, memberBName, aOwesB, bOwesA, netDebtorId, netCreditorId, netAmount } = pair;

  // Lọc các nghĩa vụ giữa A và B
  // A nợ B
  const obligationsAOwesB = obligations.filter(
    (ob) => ob.debtorMemberId === memberAId && ob.creditorMemberId === memberBId
  );
  // B nợ A
  const obligationsBOwesA = obligations.filter(
    (ob) => ob.debtorMemberId === memberBId && ob.creditorMemberId === memberAId
  );

  const themeA = getMemberTheme({ name: memberAName });
  const themeB = getMemberTheme({ name: memberBName });

  const debtorName = netDebtorId === memberAId ? memberAName : memberBName;
  const creditorName = netCreditorId === memberAId ? memberAName : memberBName;
  const isMeDebtor = currentMemberId === netDebtorId;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Sổ đối chiếu công nợ chi tiết" maxWidth="lg">
      <div className="space-y-4">
        {/* 1. Header đối chiếu 2 cá nhân */}
        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div
                className="w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-xs text-white shadow-2xs"
                style={{ backgroundColor: themeA.hex }}
              >
                {getInitials(memberAName)}
              </div>
              <div>
                <span className="text-xs font-bold text-slate-800 block">{memberAName}</span>
                <span className="text-[10px] text-slate-400">
                  {memberAId === currentMemberId ? '(Bạn)' : 'Thành viên'}
                </span>
              </div>
            </div>

            <div className="flex flex-col items-center px-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Đối chiếu</span>
              <div className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-600 shadow-2xs font-bold">
                ⇄
              </div>
            </div>

            <div className="flex items-center space-x-2.5 text-right">
              <div>
                <span className="text-xs font-bold text-slate-800 block">{memberBName}</span>
                <span className="text-[10px] text-slate-400">
                  {memberBId === currentMemberId ? '(Bạn)' : 'Thành viên'}
                </span>
              </div>
              <div
                className="w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-xs text-white shadow-2xs"
                style={{ backgroundColor: themeB.hex }}
              >
                {getInitials(memberBName)}
              </div>
            </div>
          </div>

          {/* Huy hiệu kết luận đối chiếu */}
          <div className="mt-3.5 pt-3 border-t border-slate-200 flex items-center justify-between">
            <div>
              <span className="text-[11px] text-slate-500 block">Số dư bù trừ cuối cùng:</span>
              <div className="text-sm font-extrabold text-slate-900 mt-0.5">
                {netAmount > 0 ? (
                  <span>
                    <span className="text-rose-600">{debtorName}</span> còn nợ{' '}
                    <span className="text-emerald-700">{creditorName}</span>:{' '}
                    <span className="text-rose-600 font-black">{formatVND(netAmount)}</span>
                  </span>
                ) : (
                  <span className="text-emerald-700 flex items-center space-x-1">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Hai bạn đã hoàn toàn cân bằng (0 đ)</span>
                  </span>
                )}
              </div>
            </div>

            {netAmount > 0 && isMeDebtor && onOpenPaymentModal && (
              <button
                onClick={() => {
                  onClose();
                  onOpenPaymentModal(netCreditorId || undefined, netAmount);
                }}
                className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs px-3.5 py-2 rounded-xl flex items-center space-x-1.5 transition active:scale-95 shadow-xs"
              >
                <QrCode className="w-3.5 h-3.5 text-emerald-400" />
                <span>Trả nợ ngay</span>
              </button>
            )}
          </div>
        </div>

        {/* 2. Công thức cộng trừ trực quan (Math Equation) */}
        <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-2xl text-xs space-y-1.5">
          <div className="flex items-center space-x-1 text-amber-900 font-bold">
            <HelpCircle className="w-3.5 h-3.5 text-amber-700" />
            <span>Minh bạch phép tính cộng trừ nợ:</span>
          </div>
          <div className="text-[11px] text-amber-800 leading-relaxed font-mono">
            {aOwesB > 0 || bOwesA > 0 ? (
              <div className="space-y-0.5">
                <div>
                  • <b>{memberAName}</b> nợ <b>{memberBName}</b>: {formatVND(aOwesB)} (từ các khoản {memberBName} chi trả)
                </div>
                <div>
                  • <b>{memberBName}</b> nợ <b>{memberAName}</b>: {formatVND(bOwesA)} (từ các khoản {memberAName} chi trả)
                </div>
                <div className="pt-1 border-t border-amber-200/60 font-bold text-amber-950">
                  → Bù trừ: |{formatVND(aOwesB)} - {formatVND(bOwesA)}| = {formatVND(netAmount)} (
                  {debtorName} trả {creditorName})
                </div>
              </div>
            ) : (
              <div>Hai bên không phát sinh khoản nợ nào với nhau.</div>
            )}
          </div>
        </div>

        {/* 3. Chi tiết từng chiều nợ */}
        <div className="space-y-3">
          {/* Chiều 1: A nợ B */}
          <div className="border border-slate-200/90 rounded-2xl overflow-hidden bg-white">
            <div className="p-3 bg-slate-50 border-b border-slate-200/80 flex items-center justify-between text-xs font-bold text-slate-800">
              <span className="flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                <span>
                  Khoản {memberAName} nợ {memberBName} ({obligationsAOwesB.length} khoản)
                </span>
              </span>
              <span className="font-extrabold text-slate-900">{formatVND(aOwesB)}</span>
            </div>

            <div className="divide-y divide-slate-100 max-h-48 overflow-y-auto">
              {obligationsAOwesB.length === 0 ? (
                <div className="p-3 text-center text-xs text-slate-400">Không có khoản nợ nào</div>
              ) : (
                obligationsAOwesB.map((ob) => (
                  <div key={ob.id} className="p-2.5 flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-2">
                      <Receipt className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                      <div>
                        <div className="font-semibold text-slate-800">{ob.activityTitle}</div>
                        <div className="text-[10px] text-slate-400">
                          {formatDateTime(ob.activityOccurredAt || ob.createdAt)}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-extrabold text-slate-900">{formatVND(ob.remainingAmount)}</div>
                      {ob.settledAmount > 0 && (
                        <div className="text-[10px] text-slate-400">
                          Gốc: {formatVND(ob.originalAmount)} (đã trả: {formatVND(ob.settledAmount)})
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Chiều 2: B nợ A */}
          <div className="border border-slate-200/90 rounded-2xl overflow-hidden bg-white">
            <div className="p-3 bg-slate-50 border-b border-slate-200/80 flex items-center justify-between text-xs font-bold text-slate-800">
              <span className="flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>
                  Khoản {memberBName} nợ {memberAName} ({obligationsBOwesA.length} khoản)
                </span>
              </span>
              <span className="font-extrabold text-slate-900">{formatVND(bOwesA)}</span>
            </div>

            <div className="divide-y divide-slate-100 max-h-48 overflow-y-auto">
              {obligationsBOwesA.length === 0 ? (
                <div className="p-3 text-center text-xs text-slate-400">Không có khoản nợ nào</div>
              ) : (
                obligationsBOwesA.map((ob) => (
                  <div key={ob.id} className="p-2.5 flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-2">
                      <Receipt className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                      <div>
                        <div className="font-semibold text-slate-800">{ob.activityTitle}</div>
                        <div className="text-[10px] text-slate-400">
                          {formatDateTime(ob.activityOccurredAt || ob.createdAt)}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-extrabold text-slate-900">{formatVND(ob.remainingAmount)}</div>
                      {ob.settledAmount > 0 && (
                        <div className="text-[10px] text-slate-400">
                          Gốc: {formatVND(ob.originalAmount)} (đã trả: {formatVND(ob.settledAmount)})
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Nút đóng */}
        <div className="pt-2">
          <button
            onClick={onClose}
            className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 px-4 rounded-xl text-xs transition"
          >
            Đóng bảng đối chiếu
          </button>
        </div>
      </div>
    </Modal>
  );
};
