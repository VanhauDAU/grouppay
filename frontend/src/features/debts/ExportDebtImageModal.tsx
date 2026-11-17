import React, { useRef, useState } from 'react';
import {
  Download,
  Copy,
  Share2,
  Check,
  CheckCircle2,
  Receipt,
  ArrowRight,
  Sparkles,
  Layers,
  Image as ImageIcon
} from 'lucide-react';
import { Modal } from '../../components/common/Modal.js';
import { formatVND } from '../../utils/format.js';
import { toPng, toBlob } from 'html-to-image';
import { toast } from 'sonner';

interface Member {
  id: string;
  name: string;
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
  const activeDebts = pairwiseDebts.filter((d: any) => d.netAmount > 0);
  const settlementProposals = dashboardData?.settlementProposals || [];
  const totalExpense = dashboardData?.group?.totalExpense || 0;

  // Danh sách chuyển tiền ưu tiên dùng thuật toán tối giản nếu có, hoặc danh sách công nợ ròng
  const transferPlan: { from: string; to: string; amount: number }[] =
    settlementProposals.length > 0
      ? settlementProposals.map((p: any) => ({
          from: p.fromMemberName,
          to: p.toMemberName,
          amount: p.amount
        }))
      : activeDebts.map((d: any) => ({
          from: d.netDebtorName,
          to: d.netCreditorName,
          amount: d.netAmount
        }));

  // Danh sách ai được nhận lại / ai cần trả
  const memberBalances: { name: string; net: number }[] =
    dashboardData?.group?.memberBalances || [];
  const receivers = memberBalances.filter((m) => m.net > 0);
  const payers = memberBalances.filter((m) => m.net < 0);

  const currentDateStr = new Date().toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  // Tải ảnh về máy
  const handleDownload = async () => {
    if (!cardRef.current) return;
    try {
      setIsGenerating(true);
      const dataUrl = await toPng(cardRef.current, {
        quality: 0.95,
        pixelRatio: 2.5,
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
        pixelRatio: 2.5,
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
        pixelRatio: 2.5,
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
    <Modal isOpen={isOpen} onClose={onClose} title="Xuất ảnh công nợ gửi Messenger" maxWidth="md">
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

        {/* Khung hiển thị trước Thẻ Ảnh (Infographic Card Preview) */}
        <div className="bg-slate-100/80 p-2 sm:p-3 rounded-2xl flex justify-center overflow-x-auto">
          {/* PHẦN ĐƯỢC CHỤP ẢNH CHUẨN XÁC */}
          <div
            ref={cardRef}
            className="w-full max-w-[390px] bg-white rounded-3xl p-5 shadow-md border border-slate-200 text-slate-900 space-y-4"
            style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
          >
            {/* Header Thẻ: Gradient bắt mắt */}
            <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white p-4 rounded-2xl shadow-xs space-y-1">
              <div className="flex items-center justify-between text-[11px] text-slate-400 uppercase tracking-wider font-bold">
                <span>GroupPay • Công Nợ</span>
                <span>{currentDateStr}</span>
              </div>
              <h3 className="text-base font-black tracking-tight text-white line-clamp-1">
                {groupName}
              </h3>
              <div className="text-[11px] text-emerald-400 font-semibold">
                Mã nhóm: {groupCode.toUpperCase()}
              </div>
            </div>

            {/* Chỉ số chính: Tổng chi tiêu */}
            {totalExpense > 0 && (
              <div className="bg-slate-50 border border-slate-100 p-3 rounded-2xl flex items-center justify-between text-xs">
                <span className="font-bold text-slate-500">Tổng chi tiêu nhóm:</span>
                <span className="text-sm font-black text-slate-900">{formatVND(totalExpense)}</span>
              </div>
            )}

            {/* Mục quan trọng nhất: Kế hoạch chuyển tiền (Ai chuyển cho ai) */}
            <div className="space-y-2">
              <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-800 uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                <span>Kế hoạch chuyển tiền ({transferPlan.length})</span>
              </div>

              {transferPlan.length === 0 ? (
                <div className="bg-emerald-50 border border-emerald-200/80 p-4 rounded-2xl text-center space-y-1">
                  <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto" />
                  <div className="text-xs font-bold text-emerald-800">Cả nhóm đã cân bằng!</div>
                  <div className="text-[11px] text-emerald-600">Không còn ai nợ ai tiền nữa.</div>
                </div>
              ) : (
                <div className="space-y-2">
                  {transferPlan.map((item, idx) => (
                    <div
                      key={idx}
                      className="bg-slate-50 p-3 rounded-2xl border border-slate-200/70 flex items-center justify-between"
                    >
                      <div className="flex items-center space-x-1.5 text-xs">
                        <span className="font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-lg border border-rose-100">
                          {item.from}
                        </span>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                        <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-100">
                          {item.to}
                        </span>
                      </div>
                      <span className="text-sm font-black text-slate-900">
                        {formatVND(item.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Tóm tắt nhanh: Ai nhận / Ai trả */}
            {(receivers.length > 0 || payers.length > 0) && (
              <div className="pt-2 border-t border-slate-100 text-[11px] space-y-1.5">
                <div className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                  Số dư ròng từng thành viên:
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {receivers.map((r, i) => (
                    <span
                      key={i}
                      className="bg-emerald-50 text-emerald-800 border border-emerald-100 font-bold px-2 py-0.5 rounded-lg"
                    >
                      {r.name}: +{formatVND(r.net)}
                    </span>
                  ))}
                  {payers.map((p, i) => (
                    <span
                      key={i}
                      className="bg-rose-50 text-rose-800 border border-rose-100 font-bold px-2 py-0.5 rounded-lg"
                    >
                      {p.name}: -{formatVND(Math.abs(p.net))}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Footer Thẻ */}
            <div className="pt-2 border-t border-slate-100 text-center text-[10px] text-slate-400 font-semibold">
              ⚡ Minh bạch • Chính xác • Gửi vào Messenger/Zalo nhóm
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};
