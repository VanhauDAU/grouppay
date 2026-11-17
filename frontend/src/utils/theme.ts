export interface ThemeColor {
  id: string;
  name: string;
  hex: string;
  bgLight: string;
  borderLight: string;
}

export const PRESET_COLORS: { id: string; name: string; hex: string }[] = [
  // Hàng Xanh lá / Ngọc
  { id: 'emerald', name: 'Xanh Ngọc', hex: '#10b981' },
  { id: 'teal', name: 'Xanh Mòng Két', hex: '#14b8a6' },
  { id: 'mint', name: 'Bạc Hà', hex: '#059669' },
  { id: 'lime', name: 'Xanh Chanh', hex: '#65a30d' },
  
  // Hàng Xanh dương / Biển
  { id: 'cyan', name: 'Xanh Lam', hex: '#06b6d4' },
  { id: 'sky', name: 'Xanh Da Trời', hex: '#0284c7' },
  { id: 'blue', name: 'Xanh Đại Dương', hex: '#2563eb' },
  { id: 'indigo', name: 'Xanh Chàm', hex: '#4f46e5' },

  // Hàng Tím / Hồng
  { id: 'violet', name: 'Tím Thạch Anh', hex: '#7c3aed' },
  { id: 'purple', name: 'Tím Đậm', hex: '#9333ea' },
  { id: 'fuchsia', name: 'Hồng Fuchsia', hex: '#c026d3' },
  { id: 'pink', name: 'Hồng Sen', hex: '#db2777' },

  // Hàng Đỏ / Cam / Vàng
  { id: 'rose', name: 'Đỏ Hồng', hex: '#e11d48' },
  { id: 'red', name: 'Đỏ Ruby', hex: '#dc2626' },
  { id: 'coral', name: 'Cam San Hô', hex: '#f43f5e' },
  { id: 'orange', name: 'Cam Rực Rỡ', hex: '#ea580c' },
  { id: 'amber', name: 'Hổ Phách', hex: '#d97706' },
  { id: 'gold', name: 'Vàng Hoàng Kim', hex: '#ca8a04' },

  // Hàng Đơn sắc / Tối giản
  { id: 'slate', name: 'Xám Tối Giản', hex: '#475569' },
  { id: 'midnight', name: 'Đen Than Chì', hex: '#0f172a' }
];

export const DEFAULT_HEX = '#10b981';

// Chuyển hex sang rgb
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let clean = hex.replace('#', '');
  if (clean.length === 3) {
    clean = clean.split('').map((c) => c + c).join('');
  }
  const num = parseInt(clean, 16);
  if (isNaN(num)) return { r: 16, g: 185, b: 129 };
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  };
}

// Tạo màu tương phản cho text trên nền màu (trắng hoặc đen)
export function getContrastTextColor(hex: string): '#ffffff' | '#0f172a' {
  const { r, g, b } = hexToRgb(hex);
  // Luminance formula
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 150 ? '#0f172a' : '#ffffff';
}

// Tạo ThemeColor từ mã Hex bất kỳ
export function getThemeFromHex(hex?: string | null): ThemeColor {
  const validHex = hex && /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(hex) ? hex : DEFAULT_HEX;
  const found = PRESET_COLORS.find((p) => p.hex.toLowerCase() === validHex.toLowerCase());

  return {
    id: found ? found.id : 'custom',
    name: found ? found.name : 'Tùy chỉnh',
    hex: validHex,
    bgLight: `${validHex}15`,
    borderLight: `${validHex}35`
  };
}

// Cập nhật biến CSS toàn cục lên document.documentElement
export function applyThemeToDocument(hex: string) {
  if (typeof document === 'undefined') return;
  const { r, g, b } = hexToRgb(hex);
  const root = document.documentElement;
  root.style.setProperty('--primary', hex);
  root.style.setProperty('--primary-rgb', `${r}, ${g}, ${b}`);
  root.style.setProperty('--primary-light', `rgba(${r}, ${g}, ${b}, 0.1)`);
  root.style.setProperty('--primary-border', `rgba(${r}, ${g}, ${b}, 0.25)`);
}

// Lấy theme cho thành viên từ avatarUrl hoặc tên
export function getMemberTheme(member?: { avatarUrl?: string | null; name?: string } | null): ThemeColor {
  if (!member) return getThemeFromHex(DEFAULT_HEX);

  // Nếu avatarUrl có chứa định dạng "color:#..." hoặc "color:name"
  if (member.avatarUrl && member.avatarUrl.startsWith('color:')) {
    const val = member.avatarUrl.replace('color:', '');
    if (val.startsWith('#')) {
      return getThemeFromHex(val);
    }
    const preset = PRESET_COLORS.find((p) => p.id === val);
    if (preset) return getThemeFromHex(preset.hex);
  }

  // Fallback hash ổn định theo tên
  if (member.name) {
    let hash = 0;
    for (let i = 0; i < member.name.length; i++) {
      hash = member.name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const idx = Math.abs(hash) % PRESET_COLORS.length;
    return getThemeFromHex(PRESET_COLORS[idx].hex);
  }

  return getThemeFromHex(DEFAULT_HEX);
}
