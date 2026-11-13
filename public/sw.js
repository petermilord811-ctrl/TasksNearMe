/*
 * TasksNearMe service worker: notifications on this device (Web Push; src/integrations/push sends them,
 * encrypted for this browser). It shows each push and opens its page on a tap. Nothing is cached here.
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  const title = typeof data.title === 'string' && data.title ? data.title : 'TasksNearMe';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof data.body === 'string' ? data.body : '',
      tag: typeof data.tag === 'string' ? data.tag : undefined,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-72.png',
      data: { url: typeof data.url === 'string' ? data.url : '/app' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  let url;
  try {
    url = new URL(event.notification.data && event.notification.data.url ? event.notification.data.url : '/app', self.location.origin);
  } catch {
    url = new URL('/app', self.location.origin);
  }
  // Only our own pages open from a notification.
  if (url.origin !== self.location.origin) url = new URL('/app', self.location.origin);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const same = windows.find((client) => client.url === url.href);
      if (same && 'focus' in same) return same.focus();
      return self.clients.openWindow(url.href);
    })(),
  );
});
