import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export interface TourStep {
  /** Giá trị data-tour của phần tử cần chiếu sáng; bỏ trống = thẻ giữa màn hình */
  target?: string;
  title: string;
  body: React.ReactNode;
  emoji?: string;
}

interface OnboardingTourProps {
  open: boolean;
  steps: TourStep[];
  accentHex: string;
  onFinish: () => void;
}

const PAD = 8; // khoảng hở quanh vùng chiếu sáng
const CARD_W = 320;

function findTarget(key?: string): HTMLElement | null {
  if (!key) return null;
  const el = document.querySelector<HTMLElement>(`[data-tour="${key}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? el : null;
}

/**
 * Tour làm quen dạng "spotlight": làm tối màn hình, khoét sáng phần tử đang giới thiệu.
 * Bước nào không tìm thấy phần tử (ví dụ chưa chọn tên) sẽ tự bỏ qua.
 */
export const OnboardingTour: React.FC<OnboardingTourProps> = ({ open, steps, accentHex, onFinish }) => {
  // Chỉ giữ các bước có mục tiêu hiển thị trên màn hình lúc mở tour
  const [activeSteps, setActiveSteps] = useState<TourStep[]>([]);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [viewport, setViewport] = useState({ w: window.innerWidth, h: window.innerHeight });

  useEffect(() => {
    if (!open) return;
    setActiveSteps(steps.filter((s) => !s.target || findTarget(s.target)));
    setIndex(0);
  }, [open, steps]);

  const step = activeSteps[index];
  const isLast = index >= activeSteps.length - 1;
  const next = () => {
    if (isLast) onFinish();
    else setIndex((i) => i + 1);
  };

  const measure = useCallback(() => {
    setViewport({ w: window.innerWidth, h: window.innerHeight });
    const el = findTarget(step?.target);
    setRect(el ? el.getBoundingClientRect() : null);
  }, [step]);

  // Cuộn phần tử vào giữa màn hình rồi đo vị trí
  useLayoutEffect(() => {
    if (!open || !step) return;
    const el = findTarget(step.target);
    if (el) {
      const r = el.getBoundingClientRect();
      const fixed = getComputedStyle(el).position === 'fixed' || !!el.closest('nav, header');
      if (!fixed && (r.top < 80 || r.bottom > window.innerHeight - 140)) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }
    measure();
    const t1 = setTimeout(measure, 350);
    const t2 = setTimeout(measure, 700);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [open, step, measure]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [open, measure]);

  // Phím tắt trên máy tính
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFinish();
      if (e.key === 'ArrowRight' || e.key === 'Enter') next();
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!open || !step) return null;

  // Vị trí thẻ giải thích: dưới vùng sáng nếu đủ chỗ, không thì phía trên; không có mục tiêu thì ở giữa
  const cardW = Math.min(CARD_W, viewport.w - 32);
  let cardStyle: React.CSSProperties;
  if (rect) {
    const spaceBelow = viewport.h - rect.bottom;
    const left = Math.min(Math.max(16, rect.left + rect.width / 2 - cardW / 2), viewport.w - cardW - 16);
    cardStyle =
      spaceBelow > 230
        ? { top: rect.bottom + PAD + 12, left, width: cardW }
        : { bottom: viewport.h - rect.top + PAD + 12, left, width: cardW };
  } else {
    // Căn giữa bằng flex ở lớp bọc (không dùng transform vì hiệu ứng trượt lên sẽ ghi đè)
    cardStyle = { position: 'relative', width: cardW };
  }

  return createPortal(
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label="Hướng dẫn sử dụng">
      {/* Lớp tối + khoét sáng */}
      {rect ? (
        <div
          className="absolute rounded-2xl transition-all duration-300 ease-out pointer-events-none"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: `0 0 0 9999px rgba(15, 23, 42, 0.62), 0 0 0 3px ${accentHex}, 0 0 24px 4px ${accentHex}66`
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-slate-900/60 animate-fade-in" />
      )}
      {/* Chặn bấm nhầm vào giao diện phía sau */}
      <div className="absolute inset-0" onClick={next} />

      {/* Thẻ giải thích */}
      <div className={rect ? 'contents' : 'absolute inset-0 flex items-center justify-center pointer-events-none'}>
      <div
        key={index}
        className="absolute bg-white rounded-3xl shadow-2xl p-4 animate-sheet-up pointer-events-auto"
        style={cardStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onFinish}
          className="absolute top-3 right-3 p-1 text-slate-300 hover:text-slate-600 rounded-full"
          aria-label="Bỏ qua hướng dẫn"
        >
          <X className="w-4 h-4" />
        </button>

        {step.emoji && <div className="text-3xl mb-1 leading-none">{step.emoji}</div>}
        <div className="text-[15px] font-extrabold text-slate-900 pr-6 leading-snug">{step.title}</div>
        <div className="text-[13px] text-slate-600 leading-relaxed mt-1">{step.body}</div>

        <div className="flex items-center justify-between mt-4">
          <div className="flex items-center gap-1">
            {activeSteps.map((_, i) => (
              <span
                key={i}
                className="h-1.5 rounded-full transition-all duration-300"
                style={{ width: i === index ? 16 : 6, backgroundColor: i <= index ? accentHex : '#e2e8f0' }}
              />
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            {index > 0 ? (
              <button
                type="button"
                onClick={() => setIndex((i) => i - 1)}
                className="text-xs font-bold text-slate-500 px-3 py-2 rounded-xl hover:bg-slate-100"
              >
                Lùi
              </button>
            ) : (
              <button
                type="button"
                onClick={onFinish}
                className="text-xs font-bold text-slate-400 px-3 py-2 rounded-xl hover:bg-slate-100"
              >
                Bỏ qua
              </button>
            )}
            <button
              type="button"
              onClick={next}
              className="text-xs font-extrabold text-white px-4 py-2 rounded-xl active:scale-95 transition"
              style={{ backgroundColor: accentHex }}
            >
              {isLast ? 'Bắt đầu dùng' : index === 0 ? 'Xem nhanh' : 'Tiếp'}
            </button>
          </div>
        </div>
      </div>
      </div>
    </div>,
    document.body
  );
};

// ---------- Lưu trạng thái đã xem (cục bộ, không tốn request) ----------

const TOUR_KEY = 'tinhtien_tour_group_v1';

export function hasSeenTour(): boolean {
  try {
    return localStorage.getItem(TOUR_KEY) === 'done';
  } catch {
    return true;
  }
}

export function markTourSeen() {
  try {
    localStorage.setItem(TOUR_KEY, 'done');
  } catch {
    // ignore
  }
}

export function isDismissed(key: string): boolean {
  try {
    return localStorage.getItem(`tinhtien_tip_${key}`) === '1';
  } catch {
    return false;
  }
}

export function dismissTip(key: string) {
  try {
    localStorage.setItem(`tinhtien_tip_${key}`, '1');
  } catch {
    // ignore
  }
}
