export interface ThemeColor {
  id: string;
  name: string;
  hex: string;
  bgPrimary: string;
  bgLight: string;
  textPrimary: string;
  borderLight: string;
  badge: string;
  btnPrimary: string;
  ring: string;
  avatar: string;
}

export const COLOR_THEMES: Record<string, ThemeColor> = {
  emerald: {
    id: 'emerald',
    name: 'Xanh Ngọc',
    hex: '#10b981',
    bgPrimary: 'bg-emerald-600',
    bgLight: 'bg-emerald-50',
    textPrimary: 'text-emerald-600',
    borderLight: 'border-emerald-200',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    btnPrimary: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20',
    ring: 'focus:ring-emerald-500',
    avatar: 'bg-emerald-600 text-white'
  },
  indigo: {
    id: 'indigo',
    name: 'Xanh Chàm',
    hex: '#6366f1',
    bgPrimary: 'bg-indigo-600',
    bgLight: 'bg-indigo-50',
    textPrimary: 'text-indigo-600',
    borderLight: 'border-indigo-200',
    badge: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    btnPrimary: 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-600/20',
    ring: 'focus:ring-indigo-500',
    avatar: 'bg-indigo-600 text-white'
  },
  violet: {
    id: 'violet',
    name: 'Tím Thạch Anh',
    hex: '#8b5cf6',
    bgPrimary: 'bg-violet-600',
    bgLight: 'bg-violet-50',
    textPrimary: 'text-violet-600',
    borderLight: 'border-violet-200',
    badge: 'bg-violet-50 text-violet-700 border-violet-200',
    btnPrimary: 'bg-violet-600 hover:bg-violet-700 text-white shadow-violet-600/20',
    ring: 'focus:ring-violet-500',
    avatar: 'bg-violet-600 text-white'
  },
  blue: {
    id: 'blue',
    name: 'Xanh Biển',
    hex: '#3b82f6',
    bgPrimary: 'bg-blue-600',
    bgLight: 'bg-blue-50',
    textPrimary: 'text-blue-600',
    borderLight: 'border-blue-200',
    badge: 'bg-blue-50 text-blue-700 border-blue-200',
    btnPrimary: 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/20',
    ring: 'focus:ring-blue-500',
    avatar: 'bg-blue-600 text-white'
  },
  rose: {
    id: 'rose',
    name: 'Đỏ Hồng',
    hex: '#f43f5e',
    bgPrimary: 'bg-rose-600',
    bgLight: 'bg-rose-50',
    textPrimary: 'text-rose-600',
    borderLight: 'border-rose-200',
    badge: 'bg-rose-50 text-rose-700 border-rose-200',
    btnPrimary: 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/20',
    ring: 'focus:ring-rose-500',
    avatar: 'bg-rose-600 text-white'
  },
  amber: {
    id: 'amber',
    name: 'Cam Ấm',
    hex: '#f59e0b',
    bgPrimary: 'bg-amber-600',
    bgLight: 'bg-amber-50',
    textPrimary: 'text-amber-600',
    borderLight: 'border-amber-200',
    badge: 'bg-amber-50 text-amber-700 border-amber-200',
    btnPrimary: 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-600/20',
    ring: 'focus:ring-amber-500',
    avatar: 'bg-amber-600 text-white'
  },
  teal: {
    id: 'teal',
    name: 'Xanh Mòng Két',
    hex: '#14b8a6',
    bgPrimary: 'bg-teal-600',
    bgLight: 'bg-teal-50',
    textPrimary: 'text-teal-600',
    borderLight: 'border-teal-200',
    badge: 'bg-teal-50 text-teal-700 border-teal-200',
    btnPrimary: 'bg-teal-600 hover:bg-teal-700 text-white shadow-teal-600/20',
    ring: 'focus:ring-teal-500',
    avatar: 'bg-teal-600 text-white'
  },
  slate: {
    id: 'slate',
    name: 'Xám Tối Giản',
    hex: '#475569',
    bgPrimary: 'bg-slate-800',
    bgLight: 'bg-slate-100',
    textPrimary: 'text-slate-800',
    borderLight: 'border-slate-300',
    badge: 'bg-slate-100 text-slate-800 border-slate-300',
    btnPrimary: 'bg-slate-800 hover:bg-slate-900 text-white shadow-slate-800/20',
    ring: 'focus:ring-slate-500',
    avatar: 'bg-slate-800 text-white'
  }
};

export const DEFAULT_THEME_KEY = 'emerald';

export function getTheme(themeKey?: string | null): ThemeColor {
  if (themeKey && COLOR_THEMES[themeKey]) {
    return COLOR_THEMES[themeKey];
  }
  return COLOR_THEMES[DEFAULT_THEME_KEY];
}

export function getMemberTheme(member?: { avatarUrl?: string | null; name?: string } | null): ThemeColor {
  if (!member) return COLOR_THEMES[DEFAULT_THEME_KEY];

  if (member.avatarUrl && member.avatarUrl.startsWith('color:')) {
    const key = member.avatarUrl.replace('color:', '');
    if (COLOR_THEMES[key]) return COLOR_THEMES[key];
  }

  if (member.name) {
    const keys = Object.keys(COLOR_THEMES);
    let hash = 0;
    for (let i = 0; i < member.name.length; i++) {
      hash = member.name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const idx = Math.abs(hash) % keys.length;
    return COLOR_THEMES[keys[idx]];
  }

  return COLOR_THEMES[DEFAULT_THEME_KEY];
}
