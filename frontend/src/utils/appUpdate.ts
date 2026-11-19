import { toast } from 'sonner';

declare const __APP_VERSION__: string;

const CHECK_INTERVAL_MS = 30 * 60 * 1000;
let checking = false;
let notified = false;

async function fetchLatestVersion(): Promise<string | null> {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.version === 'string' ? data.version : null;
  } catch {
    return null;
  }
}

/**
 * App đã cài trên màn hình chính (iOS/Android) có thể chạy bản cũ rất lâu vì không bao giờ "tải lại trang".
 * Mỗi lần quay lại app (và mỗi 30 phút) so sánh với /version.json:
 *  - Vừa mở lại app  -> tải lại ngay (người dùng chưa thao tác gì, không mất dữ liệu)
 *  - Đang dùng       -> hiện nút "Cập nhật" để người dùng chủ động bấm
 */
export function startAppUpdateWatcher() {
  if (!import.meta.env.PROD) return;
  const current = __APP_VERSION__;

  const check = async (reason: 'resume' | 'interval') => {
    if (checking) return;
    checking = true;
    try {
      // Cập nhật luôn service worker (thông báo đẩy) lên bản mới
      navigator.serviceWorker?.getRegistration().then((r) => r?.update()).catch(() => {});
      const latest = await fetchLatestVersion();
      if (!latest || latest === current) return;
      // Chống vòng lặp tải lại nếu CDN còn trả index.html cũ: mỗi phiên bản chỉ tự tải lại 1 lần
      let alreadyTried = false;
      try {
        alreadyTried = sessionStorage.getItem('tinhtien_reload_for') === latest;
        sessionStorage.setItem('tinhtien_reload_for', latest);
      } catch {
        // ignore
      }
      if (reason === 'resume' && !alreadyTried) {
        window.location.reload();
      } else if (!notified) {
        notified = true;
        toast('Đã có phiên bản mới', {
          duration: Infinity,
          action: { label: 'Cập nhật', onClick: () => window.location.reload() }
        });
      }
    } finally {
      checking = false;
    }
  };

  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
    } else if (hiddenAt && Date.now() - hiddenAt > 10_000) {
      check('resume');
    }
  });
  setInterval(() => document.visibilityState === 'visible' && check('interval'), CHECK_INTERVAL_MS);
  // Lần đầu mở app sau khi deploy: kiểm tra ngay
  setTimeout(() => check('resume'), 1500);
}
