const CACHE_NAME = 'standupindo-shell-v3';
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.public.webmanifest',
  '/manifest.admin.webmanifest',
  '/manifest.member.webmanifest',
  '/assets/images/pwa-public.png',
  '/assets/images/pwa-admin.png',
  '/assets/images/pwa-member.png',
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
