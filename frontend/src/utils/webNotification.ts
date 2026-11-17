/**
 * Web Notification & Push Manager for GroupPay
 * Supports iOS 16.4+ (PWA Home Screen Web Push), Android Chrome, macOS Safari, Windows
 */

let swRegistration: ServiceWorkerRegistration | null = null;

// Khởi tạo và đăng ký Service Worker
export async function initServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    swRegistration = reg;
    return reg;
  } catch (err) {
    console.warn('Service Worker registration failed:', err);
    return null;
  }
}

// Kiểm tra trình duyệt có hỗ trợ Notification không
export function isNotificationSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return 'Notification' in window;
}

// Kiểm tra có phải thiết bị iOS (iPhone/iPad) không
export function isIOS(): boolean {
  if (typeof window === 'undefined') return false;
  const userAgent = window.navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(userAgent);
}

// Kiểm tra web app đã được thêm vào Màn hình chính (PWA Standalone) trên iOS chưa
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
  );
}

// Lấy trạng thái quyền hiện tại
export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!isNotificationSupported()) return 'unsupported';
  return Notification.permission;
}

// Phát âm thanh báo hiệu nhẹ (Web Audio API không cần file ngoài)
function playNotificationChime() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5

    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  } catch (e) {
    // Ignore audio autoplay restrictions
  }
}

// Yêu cầu cấp quyền thông báo
export async function requestWebNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!isNotificationSupported()) return 'unsupported';

  try {
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      await initServiceWorker();
      playNotificationChime();
    }
    return perm;
  } catch (err) {
    console.error('Lỗi khi xin quyền thông báo:', err);
    return 'denied';
  }
}

// Kích hoạt hiển thị thông báo trên thiết bị (iPhone, Android, Desktop)
export async function showWebNotification(
  title: string,
  options?: { body?: string; tag?: string; url?: string }
): Promise<boolean> {
  if (!isNotificationSupported()) return false;
  if (Notification.permission !== 'granted') return false;

  playNotificationChime();

  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate([100, 50, 100]);
    } catch {
      // Ignore vibration errors
    }
  }

  const notificationOptions = {
    body: options?.body || '',
    icon: '/vite.svg',
    badge: '/vite.svg',
    tag: options?.tag || 'grouppay-alert',
    data: options?.url || window.location.href
  };

  try {
    // Ưu tiên hiển thị qua Service Worker (chuẩn cho iOS Safari & Android PWA)
    if (!swRegistration && 'serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      swRegistration = reg || null;
    }

    if (swRegistration && 'showNotification' in swRegistration) {
      await swRegistration.showNotification(title, notificationOptions);
      return true;
    }

    // Fallback qua Notification constructor
    new Notification(title, notificationOptions);
    return true;
  } catch (err) {
    console.warn('Không thể gửi system notification, fallback alert:', err);
    return false;
  }
}
