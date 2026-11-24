/*
 * TasksNearMe service worker: notifications on this device (Web Push; src/integrations/push sends them,
 * encrypted for this browser). A push that arrives while a TasksNearMe page is in front goes to that page, which shows
 * it as a toast in the app's look (src/ui/components/feedback/push-toasts.tsx; owner, 2026-11-24: the system's
 * notification over the open app was unstyled and couldn't be pressed). Otherwise, or when the page doesn't answer,
 * it shows as the device's notification, and a tap opens its page. Nothing is cached here.
 */

/** How long the page in front has to say it showed a push before the device's notification shows instead. */
const PAGE_ANSWER_MS = 1500;

/**
 * Safari, and every browser on an iPhone or iPad (all WebKit), ends a push subscription after a few pushes that showed
 * no notification, page in front or not: there, every push stays the device's notification. Chrome, Edge, Firefox and
 * Samsung Internet let a site with a page in front show it its own way.
 */
function everyPushNotifies() {
  const agent = (self.navigator && self.navigator.userAgent) || '';
  if (/iPhone|iPad|iPod/.test(agent)) return true;
  return /AppleWebKit/.test(agent) && !/(Chrome|Chromium|Edg|OPR|SamsungBrowser|Firefox)\//.test(agent);
}

/** Hands `push` to the TasksNearMe page in front, if one is; true when that page showed it. */
async function showInPage(push) {
  if (everyPushNotifies()) return false;
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const front = windows.find((client) => client.focused && client.visibilityState === 'visible');
  if (!front) return false;
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(false), PAGE_ANSWER_MS);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      resolve(Boolean(event.data && event.data.shown));
    };
    try {
      front.postMessage({ type: 'tnm:push', ...push }, [channel.port2]);
    } catch {
      clearTimeout(timer);
      resolve(false);
    }
  });
}

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
  const body = typeof data.body === 'string' ? data.body : '';
  const tag = typeof data.tag === 'string' ? data.tag : undefined;
  const url = typeof data.url === 'string' ? data.url : '/app';
  event.waitUntil(
    (async () => {
      if (await showInPage({ title, body, url, ...(tag ? { tag } : {}) })) return;
      await self.registration.showNotification(title, {
        body,
        tag,
        icon: '/icons/icon-192.png',
        badge: '/icons/badge-72.png',
        data: { url },
      });
    })(),
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
