import React from 'react';
import { LayoutDashboard, Receipt, Scale, CreditCard, Plus } from 'lucide-react';

export type NavTab = 'DASHBOARD' | 'ACTIVITIES' | 'DEBTS' | 'PAYMENTS';

interface BottomNavProps {
  activeTab: string;
  accentHex: string;
  onChange: (tab: NavTab) => void;
  onAdd: () => void;
  /** Số yêu cầu chờ mình xác nhận -> chấm đỏ trên tab Thanh toán */
  paymentBadge?: number;
}

// 5 ô cân đối: 2 tab | nút thêm | 2 tab
const SLOTS: ({ tab: NavTab; label: string; Icon: React.ComponentType<any> } | null)[] = [
  { tab: 'DASHBOARD', label: 'Tổng quan', Icon: LayoutDashboard },
  { tab: 'ACTIVITIES', label: 'Khoản chi', Icon: Receipt },
  null,
  { tab: 'DEBTS', label: 'Công nợ', Icon: Scale },
  { tab: 'PAYMENTS', label: 'Thanh toán', Icon: CreditCard }
];

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, accentHex, onChange, onAdd, paymentBadge = 0 }) => {
  const activeSlot = SLOTS.findIndex((s) => s?.tab === activeTab);

  return (
    <nav
      className="fixed inset-x-0 z-40 px-3 pointer-events-none animate-slide-up"
      style={{ bottom: 'max(10px, env(safe-area-inset-bottom))' }}
      aria-label="Điều hướng chính"
    >
      <div className="relative max-w-md mx-auto pointer-events-auto" style={{ ['--accent' as any]: accentHex }}>
        {/* Thân thanh kính mờ, khoét rãnh cong ôm nút thêm */}
        <div className="nav-shadow nav-notch absolute inset-0 rounded-[26px]" aria-hidden="true" />
        <div className="glass-bar nav-notch absolute inset-0 rounded-[26px]" />
        <div className="nav-outline nav-notch absolute inset-0 rounded-[26px] pointer-events-none" aria-hidden="true" />

        {/* Chỉ báo kính trượt theo tab đang chọn */}
        <div
          className="absolute top-1.5 bottom-1.5 w-1/5 px-1.5 transition-[transform,opacity] duration-500 ease-[cubic-bezier(0.34,1.45,0.64,1)]"
          style={{
            transform: `translateX(${Math.max(activeSlot, 0) * 100}%)`,
            opacity: activeSlot >= 0 ? 1 : 0
          }}
          aria-hidden="true"
        >
          <div className="glass-pill h-full w-full rounded-[20px]" />
        </div>

        <div className="relative grid grid-cols-5 h-[64px]">
          {SLOTS.map((slot) => {
            if (!slot) {
              return (
                <div key="add" className="relative flex justify-center">
                  <button
                    type="button"
                    data-tour="fab-add"
                    onClick={onAdd}
                    aria-label="Thêm khoản chi tiêu"
                    className="fab absolute -top-[22px] w-[58px] h-[58px] rounded-full text-white flex items-center justify-center animate-pop-in [animation-delay:220ms] active:scale-90 transition-transform duration-200"
                  >
                    <Plus className="w-7 h-7 stroke-[2.6] relative z-10" />
                  </button>
                </div>
              );
            }
            const isActive = slot.tab === activeTab;
            const { Icon } = slot;
            return (
              <button
                key={slot.tab}
                type="button"
                data-tour={`nav-${slot.tab.toLowerCase()}`}
                onClick={() => onChange(slot.tab)}
                aria-current={isActive ? 'page' : undefined}
                className="relative flex flex-col items-center justify-center gap-0.5 active:scale-90 transition-transform duration-150"
                style={{ color: isActive ? accentHex : undefined }}
              >
                <span className="relative">
                  <Icon
                    className={`w-[22px] h-[22px] transition-all duration-300 ${
                      isActive ? 'stroke-[2.4] -translate-y-px' : 'stroke-[1.9] text-slate-400'
                    }`}
                  />
                  {slot.tab === 'PAYMENTS' && paymentBadge > 0 && (
                    <span className="absolute -top-1 -right-1.5 min-w-[15px] h-[15px] px-1 rounded-full bg-rose-500 text-white text-[9px] font-extrabold leading-[15px] text-center ring-2 ring-white">
                      {paymentBadge > 9 ? '9+' : paymentBadge}
                    </span>
                  )}
                </span>
                <span
                  className={`text-[10px] leading-none transition-colors ${
                    isActive ? 'font-extrabold' : 'font-semibold text-slate-400'
                  }`}
                >
                  {slot.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
};
