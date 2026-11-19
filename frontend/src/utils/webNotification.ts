import { playSound } from './sound.js';
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

function playNotificationChime() {
  playSound('notify');
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

  const notificationOptions = {
    body: options?.body || '',
    icon: '/icons/icon-192.png',
    badge: '/favicon.png',
    tag: options?.tag || 'sononghiatinh-alert',
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

// ================= Web Push (thông báo cả khi app đã đóng / khóa màn hình) =================

const API_BASE = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api';

export function isPushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && isNotificationSupported();
}

function b64urlToUint8(base64url: string): Uint8Array {
  const b64 = base64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob(b64);
  return Uint8Array.from(raw, (ch) => ch.charCodeAt(0));
}

function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array) {
  if (!a) return false;
  const x = new Uint8Array(a);
  return x.length === b.length && x.every((v, i) => v === b[i]);
}

export type PushSetupResult = 'ok' | 'unsupported' | 'denied' | 'no-key' | 'error';

/**
 * Đăng ký thiết bị nhận push cho (nhóm, thành viên). An toàn khi gọi nhiều lần:
 * chỉ gửi lên server khi endpoint hoặc thành viên thay đổi (tiết kiệm request).
 * Không tự hỏi quyền: chỉ chạy khi quyền đã được cấp.
 */
export async function ensurePushSubscription(groupCode: string, memberId: string): Promise<PushSetupResult> {
  if (!isPushSupported()) return 'unsupported';
  if (Notification.permission !== 'granted') return 'denied';
  try {
    const reg = (await navigator.serviceWorker.getRegistration()) || (await initServiceWorker());
    if (!reg) return 'unsupported';
    await navigator.serviceWorker.ready;

    const keyRes = await fetch(`${API_BASE}/groups/${groupCode}/push/public-key`).then((r) => r.json());
    const publicKey: string | null = keyRes?.data?.publicKey;
    if (!publicKey) return 'no-key';
    const appKey = b64urlToUint8(publicKey);

    let sub = await reg.pushManager.getSubscription();
    if (sub && !sameKey(sub.options?.applicationServerKey as ArrayBuffer, appKey)) {
      await sub.unsubscribe();
      sub = null;
    }
    if (!sub) {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appKey as BufferSource });
    }

    const marker = `${memberId}|${sub.endpoint}`;
    const storeKey = `tinhtien_push_${groupCode}`;
    if (localStorage.getItem(storeKey) === marker) return 'ok';

    const res = await fetch(`${API_BASE}/groups/${groupCode}/push/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Member-Id': memberId },
      body: JSON.stringify(sub.toJSON())
    }).then((r) => r.json());
    if (!res?.success) return 'error';
    localStorage.setItem(storeKey, marker);
    return 'ok';
  } catch (err) {
    console.warn('Không thể đăng ký push:', err);
    return 'error';
  }
}

/** Gửi 1 push thử từ máy chủ tới chính thiết bị này (kiểm tra end-to-end). */
export async function sendTestPush(groupCode: string, memberId: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/groups/${groupCode}/push/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Member-Id': memberId }
    }).then((r) => r.json());
    return Boolean(res?.success);
  } catch {
    return false;
  }
}
