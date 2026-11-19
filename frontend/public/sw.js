// Service Worker – Sổ Nợ Nghĩa Tình (PWA + Web Push cho iPhone / Android / máy tính)
const SW_VERSION = 'v6';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Dọn cache của các phiên bản cũ (nếu có)
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

// Nhận thông báo đẩy từ máy chủ. iOS/Chrome bắt buộc LUÔN hiển thị thông báo cho mỗi push.
self.addEventListener('push', (event) => {
  let data = { title: 'Sổ Nợ Nghĩa Tình', body: 'Có cập nhật mới từ nhóm của bạn', url: '/', tag: undefined };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (e) {
    if (event.data) data.body = event.data.text();
  }

  event.waitUntil(
    (async () => {
      const isPayment = String(data.tag || '').startsWith('payment-');
      await self.registration.showNotification(data.title, {
        body: data.body,
        icon: '/icons/icon-192.png?v=4',
        badge: '/favicon-32x32.png',
        tag: data.tag || undefined,
        // Cùng tag (vd. cùng 1 giao dịch) vẫn đổ chuông lại khi có cập nhật mới
        renotify: Boolean(data.tag),
        // Luôn phát âm thanh / rung của hệ thống (iPhone dùng âm mặc định của iOS)
        silent: false,
        vibrate: isPayment ? [200, 100, 200, 100, 300] : [150, 80, 150],
        // Thông báo tiền bạc giữ lại trên màn hình máy tính tới khi người dùng xem
        requireInteraction: isPayment,
        timestamp: Date.now(),
        lang: 'vi',
        data: { url: data.url || '/' }
      });
      // Báo cho các cửa sổ app đang mở đồng bộ lại ngay
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      clients.forEach((c) => c.postMessage({ type: 'PUSH_RECEIVED', payload: data }));
    })()
  );
});

// Chạm vào thông báo -> mở đúng nhóm (ưu tiên dùng lại cửa sổ đang mở)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clients) {
        if ('focus' in client) {
          if (client.url !== target && 'navigate' in client) {
            try {
              await client.navigate(target);
            } catch (e) {}
          }
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })()
  );
});
