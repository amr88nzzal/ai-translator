/* eslint-env serviceworker */
/**
 * Service worker for «المترجم الصوتي والسياقي الذكي».
 *
 * Strategy:
 *  - App shell (HTML/JS/CSS/icons/fonts): stale-while-revalidate with a precache.
 *  - Navigations: network-first so a new deploy wins, falling back to the cached
 *    shell and finally to `/offline.html`.
 *  - /api/*: never cached (translations must always be live). Errors degrade to a
 *    structured JSON response instead of an HTML error page.
 *  - Background sync: replays nothing automatically today, but the hook is wired
 *    so a queued translation can be retried when connectivity returns.
 */

const VERSION = 'v1.0.0';
const SHELL_CACHE = `sct-shell-${VERSION}`;
const RUNTIME_CACHE = `sct-runtime-${VERSION}`;
const FONT_CACHE = `sct-fonts-${VERSION}`;
const KNOWN_CACHES = [SHELL_CACHE, RUNTIME_CACHE, FONT_CACHE];

const SHELL_ASSETS = [
  '/',
  '/offline.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-192.png',
  '/icons/maskable-512.png',
  '/icons/icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await Promise.all(
        SHELL_ASSETS.map(async (asset) => {
          try {
            await cache.add(new Request(asset, { cache: 'reload' }));
          } catch (error) {
            // A missing optional asset must not abort the whole install.
            console.warn('[sw] تعذّر تخزين', asset, error);
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((name) => !KNOWN_CACHES.includes(name)).map((name) => caches.delete(name)));

      if (self.registration.navigationPreload) {
        try {
          await self.registration.navigationPreload.disable();
        } catch {
          /* not supported */
        }
      }
      await self.clients.claim();
    })(),
  );
});

const isApiRequest = (url) => url.pathname.startsWith('/api/');
const isFontRequest = (url) =>
  url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com');
const isAssetRequest = (request) =>
  ['style', 'script', 'worker', 'image', 'font', 'manifest'].includes(request.destination);

const jsonError = (code, message) =>
  new Response(JSON.stringify({ error: { code, message, retryable: true } }), {
    status: 503,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response && response.ok) void cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  return cached || (await network) || Response.error();
}

async function networkFirstNavigation(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) void cache.put('/', response.clone());
    return response;
  } catch {
    const cached = (await cache.match(request)) || (await cache.match('/'));
    if (cached) return cached;
    const offline = await cache.match('/offline.html');
    return (
      offline ||
      new Response('<h1>لا يوجد اتصال</h1>', { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
    );
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Live translations: always go to the network, degrade to JSON on failure.
  if (isApiRequest(url)) {
    event.respondWith(
      fetch(request).catch(() =>
        jsonError('UNAVAILABLE', 'لا يوجد اتصال بالخادم حاليًا. سيتم الاحتفاظ بطلبك لإعادة المحاولة.'),
      ),
    );
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (isFontRequest(url)) {
    event.respondWith(staleWhileRevalidate(request, FONT_CACHE));
    return;
  }

  if (isAssetRequest(request) && url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
  }
});

/* ------------------------------------------------------------ background sync */

self.addEventListener('sync', (event) => {
  if (event.tag === 'sct-retry-translations') {
    event.waitUntil(
      (async () => {
        const clientsList = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
        clientsList.forEach((client) => client.postMessage({ type: 'RETRY_QUEUED_TRANSLATIONS' }));
      })(),
    );
  }
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;

  if (data.type === 'SKIP_WAITING') {
    void self.skipWaiting();
    return;
  }

  if (data.type === 'CACHE_URLS' && Array.isArray(data.urls)) {
    event.waitUntil(
      (async () => {
        const cache = await caches.open(RUNTIME_CACHE);
        await Promise.all(
          data.urls.map((url) => cache.add(url).catch(() => undefined)),
        );
      })(),
    );
  }
});

/* --------------------------------------------------------------- notifications */

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = clientsList[0];
      if (existing) {
        await existing.focus();
        return;
      }
      await self.clients.openWindow('/');
    })(),
  );
});
