const CACHE_NAME = 'spaceflight-__BUILD_ID__';
const ASSET_URL_RE = /(?:src|href)="([^"]*\/assets\/[^"]+)"/g;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const shellUrl = self.registration.scope;
      const shellResponse = await fetch(shellUrl, { cache: 'no-store' });
      const html = await shellResponse.clone().text();
      const assetUrls = [...html.matchAll(ASSET_URL_RE)].map(
        (match) => new URL(match[1], shellUrl).href
      );

      const cache = await caches.open(CACHE_NAME);
      await cache.put(shellUrl, shellResponse);
      await cache.addAll(assetUrls);
      self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(event, request));
    return;
  }

  if (request.url.startsWith(self.registration.scope)) {
    event.respondWith(cacheFirst(event, request));
  }
});

// ignoreVary: true on every lookup below is required, not optional. Static
// hosts commonly send `Vary: Origin` on asset responses, but the install-time
// cache-population fetch and a real browser-issued <script crossorigin>/<link
// crossorigin> request carry different Origin-header semantics — with the
// default (Vary-respecting) match, every lookup misses, 100% of the time,
// and offline play silently breaks (confirmed live: blank unstyled page).
async function networkFirst(event, request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone())));
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request, { ignoreVary: true, ignoreSearch: true });
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(event, request) {
  const cached = await caches.match(request, { ignoreVary: true });
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone())));
  }
  return response;
}
