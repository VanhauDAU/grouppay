import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Download, Copy, Share2, Check, CheckCircle2, ArrowRight } from 'lucide-react';
import { Avatar } from '../../components/common/Avatar.js';
import { Modal } from '../../components/common/Modal.js';
import { formatVND } from '../../utils/format.js';
import { toPng, toBlob } from 'html-to-image';
import { toast } from 'sonner';
import { api } from '../../services/api.js';
import {
  buildTransferBreakdown,
  summarizeActivity,
  ROUNDING_OPTIONS,
  type RoundingUnit,
  type BreakdownItem
} from './debtBreakdown.js';

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
  activities?: any[];
}

const PREF_KEY = 'tinhtien_debt_image_prefs';
const MAX_ITEMS_PER_LINE = 6;
const CARD_WIDTH = 420;
const MAX_DETAIL_FETCH = 40;

function loadPrefs(): { unit: RoundingUnit; showDetail: boolean } {
  try {
    const raw = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
    const unit = ROUNDING_OPTIONS.some((o) => o.value === raw.unit) ? raw.unit : 0;
    return { unit, showDetail: raw.showDetail !== false };
  } catch {
    return { unit: 0, showDetail: true };
  }
}

const shortDate = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/** Số gọn cho phần giải thích: 600.000 -> 600k, 1.200.000 -> 1,2tr (số lẻ giữ nguyên) */
const shortVND = (n: number) => {
  if (n >= 1_000_000 && n % 100_000 === 0) return `${(n / 1_000_000).toLocaleString('vi-VN')}tr`;
  if (n >= 1000 && n % 1000 === 0) return `${(n / 1000).toLocaleString('vi-VN')}k`;
  return formatVND(n);
};

/**
 * Một khoản: dòng 1 = tên · ngày (+ số tiền khi cần), dòng 2 = cách tính.
 * Ẩn số tiền khi dòng chuyển chỉ có đúng 1 khoản trùng số -> đỡ lặp số.
 */
const BreakdownRow: React.FC<{ item: BreakdownItem; detail?: any; toName: string; showAmount: boolean }> = ({
  item,
  detail,
  toName,
  showAmount
}) => {
  const plus = item.sign === 1;
  const split = detail ? summarizeActivity(detail, item.debtorId) : null;
  const meta: string[] = [];

  if (item.sourceType === 'EXPENSE') {
    if (split) {
      meta.push(
        split.isEqual
          ? `${shortVND(split.total)} ÷ ${split.people} người`
          : `${shortVND(split.total)}, ${split.people} người chia theo phần`
      );
      const payers = split.payers.length ? split.payers : [item.payerName];
      // "Bình trả" là hiển nhiên khi đang chuyển cho chính Bình -> chỉ ghi khi khác
      if (!plus || payers.length > 1 || payers[0] !== toName) meta.push(`${payers.join(', ')} trả`);
      if (split.share !== item.original) meta.push(`phần ${item.debtorName} ${shortVND(split.share)}`);
    } else {
      if (item.activityTotal) meta.push(`tổng ${shortVND(item.activityTotal)}`);
      if (!plus) meta.push(`${item.payerName} trả`);
    }
  }
  if (!plus) meta.push('được trừ');
  if (item.settled > 0) meta.push(`đã trả bớt ${shortVND(item.settled)}`);
  const title = item.sourceType === 'INITIAL_DEBT' ? 'Nợ cũ' : item.title;

  return (
    <div className="leading-snug">
      <div className="flex items-baseline gap-2">
        <div className="min-w-0 flex-1 truncate text-[12px]">
          <span className="font-semibold text-slate-700">{title}</span>
          <span className="text-slate-400"> · {shortDate(item.date)}</span>
        </div>
        {showAmount && (
          <span
            className={`text-[12px] font-semibold tabular-nums whitespace-nowrap ${plus ? 'text-slate-600' : 'text-emerald-600'}`}
          >
            {plus ? '' : '−'}
            {formatVND(item.remaining)}
          </span>
        )}
      </div>
      {meta.length > 0 && <div className="text-[10.5px] text-slate-400">{meta.join(' · ')}</div>}
    </div>
  );
};

export const ExportDebtImageModal: React.FC<ExportDebtImageModalProps> = ({
  isOpen,
  onClose,
  groupName,
  groupCode,
  members,
  debtsData,
  dashboardData,
  activities = []
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const [prefs, setPrefs] = useState(loadPrefs);
  const updatePrefs = (next: Partial<typeof prefs>) => {
    setPrefs((p) => {
      const merged = { ...p, ...next };
      try {
        localStorage.setItem(PREF_KEY, JSON.stringify(merged));
      } catch {
        /* bỏ qua: trình duyệt chặn lưu trữ */
      }
      return merged;
    });
  };
  const { unit, showDetail } = prefs;

  const { pairwiseDebts = [], obligations = [] } = debtsData || {};
  const totalExpense = dashboardData?.group?.totalExpense || 0;
  const memberById = new Map((members as any[]).map((m) => [m.id, m]));

  // Dùng NỢ RÒNG TỪNG CẶP: đúng con số app cho phép "Báo trả" (phương án tối giản có thể bảo
  // người A chuyển cho người C mà A không trực tiếp nợ -> app sẽ không ghi nhận được).
  const { groups: byDebtor, lines: transferPlan, droppedCount } = buildTransferBreakdown(
    pairwiseDebts,
    obligations,
    activities,
    unit
  );

  // Tải chi tiết cách chia (tổng tiền, số người, ai trả) cho các khoản đang hiện trên ảnh
  const [details, setDetails] = useState<Record<string, any>>({});
  const neededKey = [
    ...new Set(
      transferPlan.flatMap((t) => t.items.slice(0, MAX_ITEMS_PER_LINE).map((it) => it.activityId || '')).filter(Boolean)
    )
  ]
    .slice(0, MAX_DETAIL_FETCH)
    .sort()
    .join(',');
  useEffect(() => {
    if (!isOpen || !showDetail || !neededKey) return;
    let cancelled = false;
    (async () => {
      const ids = neededKey.split(',');
      for (let i = 0; i < ids.length; i += 6) {
        const batch = ids.slice(i, i + 6);
        const results = await Promise.all(batch.map((id) => api.getActivityDetail(groupCode, id).catch(() => null)));
        if (cancelled) return;
        setDetails((prev) => {
          const next = { ...prev };
          batch.forEach((id, k) => {
            const r: any = results[k];
            if (r?.success && r.data) next[id] = r.data;
          });
          return next;
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, showDetail, neededKey, groupCode]);

  // Thu nhỏ bản xem trước cho vừa màn hình điện thoại; ảnh xuất ra vẫn rộng đủ CARD_WIDTH
  const previewRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [cardHeight, setCardHeight] = useState(0);
  useLayoutEffect(() => {
    if (!isOpen) return;
    const measure = () => {
      const avail = previewRef.current?.clientWidth || CARD_WIDTH;
      setScale(Math.min(1, avail / CARD_WIDTH));
      setCardHeight(cardRef.current?.offsetHeight || 0);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (previewRef.current) ro.observe(previewRef.current);
    if (cardRef.current) ro.observe(cardRef.current);
    return () => ro.disconnect();
  }, [isOpen]);
  const unitLabel = ROUNDING_OPTIONS.find((o) => o.value === unit)?.label;

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

        {/* Tùy chọn nội dung ảnh */}
        <div className="space-y-2.5 rounded-2xl border border-slate-200/80 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Làm tròn</span>
            <div className="flex rounded-xl bg-slate-100 p-0.5">
              {ROUNDING_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => updatePrefs({ unit: o.value })}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                    unit === o.value ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center justify-between gap-2 cursor-pointer">
            <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Chi tiết từng khoản</span>
            <input
              type="checkbox"
              checked={showDetail}
              onChange={(e) => updatePrefs({ showDetail: e.target.checked })}
              className="w-4 h-4 accent-slate-900"
            />
          </label>
          {unit > 0 && (
            <p className="text-[10.5px] text-slate-400 leading-snug">
              Chỉ làm tròn số trên ảnh để chuyển khoản cho tiện. Công nợ trong app vẫn giữ số chính xác.
            </p>
          )}
        </div>

        {/* Xem trước ảnh */}
        <div className="bg-slate-100/80 p-3 rounded-2xl">
          <div
            ref={previewRef}
            className="w-full flex justify-center overflow-hidden"
            style={{ height: cardHeight ? cardHeight * scale : undefined }}
          >
            <div style={{ transform: `scale(${scale})`, transformOrigin: 'top center' }}>
          <div
            ref={cardRef}
            className="bg-white rounded-[22px] overflow-hidden text-slate-900"
            style={{ width: CARD_WIDTH, fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif" }}
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
                      <div key={g.id} className="rounded-2xl border border-slate-100 bg-slate-50/60 px-3.5 py-2.5">
                        <div className="flex items-center gap-2">
                          <Avatar name={g.name} avatarUrl={m?.avatarUrl} size="xs" />
                          <span className="text-[13px] font-extrabold text-slate-900 truncate">{g.name}</span>
                          <span className="text-[11px] font-semibold text-slate-400 whitespace-nowrap">chuyển cho</span>
                          {g.items.length > 1 && (
                            <span className="ml-auto text-[10.5px] text-slate-400 whitespace-nowrap">
                              tổng <span className="font-bold tabular-nums">{formatVND(g.total)}</span>
                            </span>
                          )}
                        </div>
                        <div className="mt-1.5 pl-8 space-y-2">
                          {g.items.map((t) => {
                            const shown = t.items.slice(0, MAX_ITEMS_PER_LINE);
                            const rest = t.items.slice(MAX_ITEMS_PER_LINE);
                            const restSum = rest.reduce((sum, it) => sum + it.sign * it.remaining, 0);
                            const single = t.items.length === 1 && t.items[0].sign === 1 && t.items[0].remaining === t.exact;
                            return (
                              <div key={t.toId}>
                                <div className="flex items-center gap-1.5 text-[13px]">
                                  <ArrowRight className="w-3 h-3 text-slate-300 flex-shrink-0" />
                                  <span className="font-bold text-slate-800 truncate">{t.to}</span>
                                  <span className="ml-auto font-extrabold text-rose-600 tabular-nums whitespace-nowrap">
                                    {t.amount !== t.exact && <span className="font-semibold text-rose-400">≈ </span>}
                                    {formatVND(t.amount)}
                                  </span>
                                </div>
                                {showDetail && t.items.length > 0 && (
                                  <div className="mt-1 ml-[5px] pl-3 border-l-2 border-slate-200 space-y-1.5">
                                    {shown.map((it) => (
                                      <BreakdownRow
                                        key={it.id}
                                        item={it}
                                        toName={t.to}
                                        showAmount={!single}
                                        detail={it.activityId ? details[it.activityId] : undefined}
                                      />
                                    ))}
                                    {rest.length > 0 && (
                                      <div className="flex items-baseline gap-2 text-[11px] text-slate-400">
                                        <span className="flex-1">+ {rest.length} khoản khác</span>
                                        <span className="font-semibold tabular-nums">
                                          {restSum < 0 ? '−' : ''}
                                          {formatVND(Math.abs(restSum))}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {(unit > 0 || droppedCount > 0) && (
              <div className="mx-3 mb-2 text-[9.5px] leading-snug text-slate-400 text-center">
                {unit > 0 && <>≈ là số đã làm tròn đến {unitLabel}. </>}
                {droppedCount > 0 && <>{droppedCount} khoản nhỏ làm tròn về 0đ nên không ghi. </>}
                Số chính xác xem trong app.
              </div>
            )}
            <div className="pb-2.5 text-center text-[9px] font-semibold text-slate-300">Sổ Nợ Nghĩa Tình</div>
          </div>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};
