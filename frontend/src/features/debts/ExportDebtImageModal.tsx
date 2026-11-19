import React, { useRef, useState } from 'react';
import { Download, Copy, Share2, Check, CheckCircle2, ArrowRight } from 'lucide-react';
import { Avatar } from '../../components/common/Avatar.js';
import { Modal } from '../../components/common/Modal.js';
import { formatVND } from '../../utils/format.js';
import { toPng, toBlob } from 'html-to-image';
import { toast } from 'sonner';

interface Member {
  id: string;
  name: string;
  avatarUrl?: string | null;
}

interface ExportDebtImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupName: string;
  groupCode: string;
  members: Member[];
  debtsData: any;
  dashboardData?: any;
}

export const ExportDebtImageModal: React.FC<ExportDebtImageModalProps> = ({
  isOpen,
  onClose,
  groupName,
  groupCode,
  members,
  debtsData,
  dashboardData
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const { pairwiseDebts = [] } = debtsData || {};
  const totalExpense = dashboardData?.group?.totalExpense || 0;
  const memberById = new Map((members as any[]).map((m) => [m.id, m]));

  // Dùng NỢ RÒNG TỪNG CẶP: đúng con số app cho phép "Báo trả" (phương án tối giản có thể bảo
  // người A chuyển cho người C mà A không trực tiếp nợ -> app sẽ không ghi nhận được).
  const transferPlan: { fromId: string; toId: string; from: string; to: string; amount: number }[] = pairwiseDebts
    .filter((d: any) => d.netAmount > 0)
    .map((d: any) => ({
      fromId: d.netDebtorId,
      toId: d.netCreditorId,
      from: d.netDebtorId === d.memberAId ? d.memberAName : d.memberBName,
      to: d.netCreditorId === d.memberAId ? d.memberAName : d.memberBName,
      amount: d.netAmount
    }))
    .sort((x: any, y: any) => x.from.localeCompare(y.from, 'vi') || y.amount - x.amount);
  const totalTransfer = transferPlan.reduce((sum, t) => sum + t.amount, 0);

  // Gom theo người cần trả: đọc 1 khối là biết mình phải chuyển cho ai bao nhiêu
  const byDebtor: { id: string; name: string; total: number; items: typeof transferPlan }[] = [];
  for (const t of transferPlan) {
    let g = byDebtor.find((x) => x.id === t.fromId);
    if (!g) {
      g = { id: t.fromId, name: t.from, total: 0, items: [] };
      byDebtor.push(g);
    }
    g.total += t.amount;
    g.items.push(t);
  }
  byDebtor.sort((a, b) => b.total - a.total);

  const currentDateStr = new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });

  // Tải ảnh về máy
  const handleDownload = async () => {
    if (!cardRef.current) return;
    try {
      setIsGenerating(true);
      const dataUrl = await toPng(cardRef.current, {
        quality: 0.95,
        pixelRatio: 3,
        backgroundColor: '#ffffff'
      });
      const link = document.createElement('a');
      link.download = `cong-no-${groupCode}-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
      toast.success('Đã tải ảnh công nợ về máy!');
    } catch (err) {
      console.error(err);
      toast.error('Không thể tạo ảnh, vui lòng thử lại');
    } finally {
      setIsGenerating(false);
    }
  };

  // Sao chép ảnh vào Clipboard (dán ngay vào Messenger/Zalo)
  const handleCopyImage = async () => {
    if (!cardRef.current) return;
    try {
      setIsGenerating(true);
      const blob = await toBlob(cardRef.current, {
        quality: 0.95,
        pixelRatio: 3,
        backgroundColor: '#ffffff'
      });

      if (!blob) throw new Error('Blob generation failed');

      if (navigator.clipboard && 'write' in navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2500);
        toast.success('Đã sao chép ảnh! Bạn có thể dán (Ctrl+V) ngay vào Messenger / Zalo.');
      } else {
        // Fallback tải về nếu trình duyệt không hỗ trợ copy image
        handleDownload();
      }
    } catch (err) {
      console.error(err);
      handleDownload();
    } finally {
      setIsGenerating(false);
    }
  };

  // Chia sẻ trực tiếp qua iOS / Android Share Sheet vào Messenger / Zalo
  const handleShare = async () => {
    if (!cardRef.current) return;
    try {
      setIsGenerating(true);
      const blob = await toBlob(cardRef.current, {
        quality: 0.95,
        pixelRatio: 3,
        backgroundColor: '#ffffff'
      });

      if (!blob) throw new Error('Blob generation failed');

      const file = new File([blob], `cong-no-${groupCode}.png`, { type: 'image/png' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Bảng công nợ nhóm ${groupName}`,
          text: `Bảng tổng kết công nợ & chuyển tiền nhóm ${groupName}`
        });
      } else {
        handleCopyImage();
      }
    } catch (err) {
      // User cancelled share
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Ảnh công nợ gửi nhóm" maxWidth="md">
      <div className="space-y-4">
        {/* Nút thao tác nhanh */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <button
            onClick={handleDownload}
            disabled={isGenerating}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center space-x-1.5 shadow-sm transition active:scale-95 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            <span>Tải ảnh PNG</span>
          </button>

          <button
            onClick={handleCopyImage}
            disabled={isGenerating}
            className="bg-slate-900 hover:bg-slate-800 text-white font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center space-x-1.5 shadow-sm transition active:scale-95 disabled:opacity-50"
          >
            {isCopied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            <span>{isCopied ? 'Đã sao chép' : 'Sao chép ảnh'}</span>
          </button>

          {typeof navigator !== 'undefined' && 'share' in navigator && (
            <button
              onClick={handleShare}
              disabled={isGenerating}
              className="col-span-2 sm:col-span-1 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center space-x-1.5 transition active:scale-95 disabled:opacity-50"
            >
              <Share2 className="w-4 h-4 text-slate-600" />
              <span>Gửi vào Mess</span>
            </button>
          )}
        </div>

        {/* Xem trước ảnh — thẻ gọn, chỉ giữ thông tin cần để chuyển tiền */}
        <div className="bg-slate-100/80 p-3 rounded-2xl flex justify-center overflow-x-auto">
          <div
            ref={cardRef}
            className="w-[340px] bg-white rounded-[22px] overflow-hidden text-slate-900"
            style={{ fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif" }}
          >
            {/* Đầu thẻ */}
            <div className="px-4 pt-4 pb-3 bg-gradient-to-br from-slate-900 to-slate-700 text-white">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold text-white/60 uppercase tracking-wider">Công nợ nhóm</div>
                  <div className="text-[17px] font-extrabold leading-tight truncate">{groupName}</div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-[10px] text-white/60">{currentDateStr}</div>
                  {totalExpense > 0 && (
                    <div className="text-[11px] font-bold text-white/90">Chi {formatVND(totalExpense)}</div>
                  )}
                </div>
              </div>
            </div>

            {/* Ai chuyển cho ai */}
            <div className="px-3 py-3">
              {transferPlan.length === 0 ? (
                <div className="py-5 text-center">
                  <CheckCircle2 className="w-7 h-7 text-emerald-500 mx-auto" />
                  <div className="text-sm font-extrabold text-emerald-700 mt-1">Không ai nợ ai 🎉</div>
                </div>
              ) : (
                <div className="space-y-2">
                  {byDebtor.map((g) => {
                    const m: any = memberById.get(g.id);
                    return (
                      <div key={g.id} className="rounded-2xl border border-slate-100 bg-slate-50/60 px-3 py-2">
                        <div className="flex items-center gap-2">
                          <Avatar name={g.name} avatarUrl={m?.avatarUrl} size="xs" />
                          <span className="text-[13px] font-extrabold text-slate-900 truncate">{g.name}</span>
                          <span className="text-[11px] font-semibold text-slate-400 whitespace-nowrap">chuyển cho</span>
                        </div>
                        <div className="mt-1 pl-8 space-y-0.5">
                          {g.items.map((t) => (
                            <div key={t.toId} className="flex items-center gap-1.5 text-[12.5px]">
                              <ArrowRight className="w-3 h-3 text-slate-300 flex-shrink-0" />
                              <span className="font-semibold text-slate-700 truncate">{t.to}</span>
                              <span className="ml-auto font-extrabold text-rose-600 tabular-nums whitespace-nowrap">
                                {formatVND(t.amount)}
                              </span>
                            </div>
                          ))}
                          {g.items.length > 1 && (
                            <div className="flex items-center justify-end gap-1 pt-0.5 text-[10.5px] text-slate-400">
                              <span>Tổng cộng</span>
                              <span className="font-bold tabular-nums">{formatVND(g.total)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Chân thẻ */}
            {transferPlan.length > 0 && (
              <div className="mx-3 mb-3 px-3 py-2 rounded-xl bg-slate-50 flex items-center justify-between text-[11px]">
                <span className="text-slate-500 font-semibold">{transferPlan.length} lượt chuyển</span>
                <span className="font-semibold text-slate-500">Tổng {formatVND(totalTransfer)}</span>
              </div>
            )}
            <div className="pb-2.5 text-center text-[9px] font-semibold text-slate-300">Sổ Nợ Nghĩa Tình</div>
          </div>
        </div>
      </div>
    </Modal>
  );
};
