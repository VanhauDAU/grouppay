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

/** Một khoản: dòng 1 = tên + số tiền, dòng 2 = tổng hóa đơn, chia mấy người, ai trả */
const BreakdownRow: React.FC<{ item: BreakdownItem; detail?: any }> = ({ item, detail }) => {
  const plus = item.sign === 1;
  const split = detail ? summarizeActivity(detail, item.debtorId) : null;
  const meta: string[] = [];

  if (item.sourceType === 'INITIAL_DEBT') {
    meta.push('nợ cũ nhập tay');
  } else if (item.sourceType === 'ADJUSTMENT') {
    meta.push('hoàn tiền sau khi sửa / hủy');
  } else if (split) {
    meta.push(
      split.isEqual
        ? `${formatVND(split.total)} chia đều ${split.people} người`
        : `${formatVND(split.total)} · ${split.people} người, chia theo phần`
    );
    meta.push(`${split.payers.length ? split.payers.join(', ') : item.payerName} trả`);
    // Phần của người nợ khi không tự suy ra được từ "chia đều"
    if (!split.isEqual || split.payers.length > 1 || split.share !== item.original) {
      meta.push(`phần ${item.debtorName} ${formatVND(split.share)}`);
    }
  } else {
    if (item.activityTotal) meta.push(`tổng ${formatVND(item.activityTotal)}`);
    meta.push(`${item.payerName} trả`);
  }
  if (!plus) meta.push(`${item.debtorName} nợ lại, được trừ`);
  if (item.settled > 0) meta.push(`đã trả ${formatVND(item.settled)}`);

  return (
    <div className="flex items-start gap-2 leading-snug">
      <span className="w-9 flex-shrink-0 pt-px text-[10.5px] text-slate-400 tabular-nums">{shortDate(item.date)}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-semibold text-slate-700 truncate">{item.title}</div>
        <div className="text-[10.5px] text-slate-400">
          {meta.map((m, i) => (
            <React.Fragment key={i}>
              {i > 0 && ' · '}
              <span className="whitespace-nowrap">{m}</span>
            </React.Fragment>
          ))}
        </div>
      </div>
      <span className={`text-[12px] font-bold tabular-nums whitespace-nowrap ${plus ? 'text-slate-700' : 'text-emerald-600'}`}>
        {plus ? '+' : '−'}
        {formatVND(item.remaining)}
      </span>
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
  const totalTransfer = transferPlan.reduce((sum, t) => sum + t.amount, 0);

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
                      <div key={g.id} className="rounded-2xl border border-slate-100 bg-slate-50/60 px-3 py-2">
                        <div className="flex items-center gap-2">
                          <Avatar name={g.name} avatarUrl={m?.avatarUrl} size="xs" />
                          <span className="text-[13px] font-extrabold text-slate-900 truncate">{g.name}</span>
                          <span className="text-[11px] font-semibold text-slate-400 whitespace-nowrap">chuyển cho</span>
                        </div>
                        <div className="mt-1 pl-8 space-y-0.5">
                          {g.items.map((t) => {
                            const shown = t.items.slice(0, MAX_ITEMS_PER_LINE);
                            const rest = t.items.slice(MAX_ITEMS_PER_LINE);
                            const restSum = rest.reduce((sum, it) => sum + it.sign * it.remaining, 0);
                            return (
                              <div key={t.toId} className={showDetail ? 'pb-1' : ''}>
                                <div className="flex items-center gap-1.5 text-[12.5px]">
                                  <ArrowRight className="w-3 h-3 text-slate-300 flex-shrink-0" />
                                  <span className="font-semibold text-slate-700 truncate">{t.to}</span>
                                  <span className="ml-auto font-extrabold text-rose-600 tabular-nums whitespace-nowrap">
                                    {formatVND(t.amount)}
                                  </span>
                                </div>
                                {showDetail && t.items.length > 0 && (
                                  <div className="mt-1 ml-[18px] pl-2.5 border-l-2 border-slate-200 space-y-1.5">
                                    {shown.map((it) => (
                                      <BreakdownRow key={it.id} item={it} detail={it.activityId ? details[it.activityId] : undefined} />
                                    ))}
                                    {rest.length > 0 && (
                                      <div className="flex items-center gap-1.5 text-[10.5px] text-slate-400">
                                        <span className="flex-1">+ {rest.length} khoản khác</span>
                                        <span className="font-bold tabular-nums">
                                          {restSum >= 0 ? '+' : '−'}
                                          {formatVND(Math.abs(restSum))}
                                        </span>
                                      </div>
                                    )}
                                    <div className="flex items-center gap-1.5 pt-0.5 text-[10.5px] border-t border-dashed border-slate-200">
                                      <span className="flex-1 font-semibold text-slate-500">= Còn nợ</span>
                                      <span className="font-extrabold tabular-nums text-slate-700">{formatVND(t.exact)}</span>
                                    </div>
                                    {t.amount !== t.exact && (
                                      <div className="flex items-center gap-1.5 text-[10.5px] text-slate-400">
                                        <span className="flex-1">Làm tròn đến {unitLabel}</span>
                                        <span className="font-bold tabular-nums text-rose-600">{formatVND(t.amount)}</span>
                                      </div>
                                    )}
                                  </div>
                                )}
                                {!showDetail && t.amount !== t.exact && (
                                  <div className="text-right text-[10px] text-slate-400 tabular-nums">
                                    chính xác {formatVND(t.exact)}
                                  </div>
                                )}
                              </div>
                            );
                          })}
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
            {(unit > 0 || droppedCount > 0) && (
              <div className="mx-3 mb-2 text-[9.5px] leading-snug text-slate-400 text-center">
                {unit > 0 && <>Số chuyển đã làm tròn đến {unitLabel}. </>}
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
