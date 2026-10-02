const CACHE_NAME = 'standupindo-shell-v6';
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.public.webmanifest',
  '/manifest.admin.webmanifest',
  '/manifest.member.webmanifest',
  '/assets/images/favicon.png?v=3',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    const parsed = event.data ? event.data.json() : {};
    payload = parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    payload = { body: event.data?.text() ?? '' };
  }

  const title = typeof payload.title === 'string' ? payload.title : 'Standupindo Cilegon';
  const options = {
    body: typeof payload.body === 'string' ? payload.body : 'Ada informasi baru untuk kamu.',
    icon: '/assets/images/favicon.png?v=3',
    badge: '/assets/images/favicon.png?v=3',
    tag: typeof payload.tag === 'string' ? payload.tag : undefined,
    data: { url: typeof payload.url === 'string' ? payload.url : '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url ?? '/', self.location.origin);
  const safeTarget = target.origin === self.location.origin ? target.href : self.location.origin;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => new URL(client.url).origin === self.location.origin);
      if (existing) {
        return existing.navigate(safeTarget).then(() => existing.focus());
      }
      return self.clients.openWindow(safeTarget);
    }),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;
  if (requestUrl.pathname.startsWith('/rest/') || requestUrl.pathname.startsWith('/auth/')) return;

  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request).then((response) => {
      if (response) return response;
      if (event.request.mode === 'navigate') return caches.match('/index.html');
      return Response.error();
    })),
  );
});
