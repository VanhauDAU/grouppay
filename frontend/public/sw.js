// Service Worker for Sổ Nợ Nghĩa Tình PWA & Web Push Notifications on iPhone / Android / Desktop
const CACHE_NAME = 'sononghiatinh-cache-v2';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Xử lý sự kiện hiển thị thông báo đẩy
self.addEventListener('push', (event) => {
  let data = { title: 'Sổ Nợ Nghĩa Tình', body: 'Có cập nhật mới từ nhóm của bạn' };
  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch (e) {
    if (event.data) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: '/icons/icon-192.png',
    badge: '/favicon.png',
    vibrate: [100, 50, 100],
    data: data.url || '/'
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

// Xử lý khi người dùng chạm/bấm vào thông báo
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
