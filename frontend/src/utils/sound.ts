/**
 * Âm thanh trong app, tổng hợp bằng Web Audio API:
 *  - Không tải file âm thanh nào -> 0 request lên Cloudflare, phát tức thì, chạy offline.
 *  - iOS chỉ cho phát âm thanh sau khi người dùng chạm màn hình 1 lần -> tự "mở khóa" ở lần chạm đầu.
 */

export type SoundName = 'notify' | 'success' | 'money' | 'error';

const STORAGE_KEY = 'tinhtien_sound';
let ctx: AudioContext | null = null;
const lastPlayed: Partial<Record<SoundName, number>> = {};

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  return ctx;
}

export function isSoundEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setSoundEnabled(on: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    // ignore
  }
}

/** Gọi 1 lần lúc khởi động: mở khóa audio ở lần chạm/bấm đầu tiên (bắt buộc trên iPhone). */
export function installAudioUnlock() {
  if (typeof window === 'undefined') return;
  const unlock = () => {
    const c = getCtx();
    if (!c) return;
    if (c.state === 'suspended') c.resume().catch(() => {});
    // Phát 1 buffer rỗng để iOS cho phép phát các âm sau
    try {
      const buf = c.createBuffer(1, 1, 22050);
      const src = c.createBufferSource();
      src.buffer = buf;
      src.connect(c.destination);
      src.start(0);
    } catch {
      // ignore
    }
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('touchend', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('touchend', unlock, { passive: true });
  window.addEventListener('keydown', unlock);
}

/** 1 nốt nhạc mềm (sine + đuôi tắt dần) */
function tone(c: AudioContext, freq: number, start: number, duration: number, volume = 0.18, type: OscillatorType = 'sine') {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

const PATTERNS: Record<SoundName, (c: AudioContext, t: number) => void> = {
  // "Ding-dong" nhẹ: có thông báo mới
  notify: (c, t) => {
    tone(c, 880, t, 0.35, 0.16);
    tone(c, 1318.5, t + 0.14, 0.5, 0.14);
  },
  // Hợp âm đi lên Đô-Mi-Sol: lưu chi tiêu / gửi yêu cầu thành công
  success: (c, t) => {
    tone(c, 523.25, t, 0.22, 0.14);
    tone(c, 659.25, t + 0.09, 0.22, 0.14);
    tone(c, 783.99, t + 0.18, 0.4, 0.15);
  },
  // Tiếng "ting ting" kiểu đồng xu: đã nhận / xác nhận tiền
  money: (c, t) => {
    tone(c, 1567.98, t, 0.18, 0.12, 'triangle');
    tone(c, 2093, t + 0.08, 0.35, 0.12, 'triangle');
    tone(c, 2637, t + 0.16, 0.45, 0.08, 'sine');
  },
  // Âm trầm ngắn: lỗi / bị từ chối
  error: (c, t) => {
    tone(c, 330, t, 0.18, 0.14, 'triangle');
    tone(c, 247, t + 0.12, 0.3, 0.14, 'triangle');
  }
};

const VIBRATION: Record<SoundName, number[]> = {
  notify: [60, 40, 60],
  success: [40],
  money: [30, 30, 30, 30, 60],
  error: [120]
};

export function playSound(name: SoundName) {
  if (!isSoundEnabled()) return;
  // Chống phát chồng (ví dụ cùng lúc nhận WebSocket + push cho 1 sự kiện)
  const now = Date.now();
  if (now - (lastPlayed[name] || 0) < 1200) return;
  lastPlayed[name] = now;

  try {
    if (navigator.vibrate) navigator.vibrate(VIBRATION[name]);
  } catch {
    // ignore
  }

  const c = getCtx();
  if (!c) return;
  const run = () => PATTERNS[name](c, c.currentTime + 0.01);
  if (c.state === 'suspended') c.resume().then(run).catch(() => {});
  else run();
}
