/**
 * Offline support for the installed app.
 *
 * The JS bundle's filename is content-hashed by Metro, so there's no fixed
 * list to precache — instead assets are cached as they're first requested.
 * A new deploy produces a new bundle URL, which misses the cache and is
 * fetched fresh, so cache-first is safe for everything except the HTML.
 */
const CACHE = 'infinite-v1';

self.addEventListener('install', (event) => {
  // Take over as soon as possible rather than waiting for every tab to close.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;
  // Leave cross-origin requests alone; caching them opaquely just wastes space.
  if (new URL(request.url).origin !== self.location.origin) return;

  // HTML is network-first: a deploy should be picked up on the next online
  // launch rather than being pinned to whatever was cached first.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || caches.match('index.html'))
        )
    );
    return;
  }

  const path = new URL(request.url).pathname;
  // Metro content-hashes these, so a changed file always has a new URL and the
  // cached copy can never go stale.
  const isImmutable = path.includes('/_expo/') || path.includes('/assets/');

  if (isImmutable) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok && response.type === 'basic') {
              const copy = response.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          })
      )
    );
    return;
  }

  // Everything else (manifest, icons) keeps a stable filename, so serve the
  // cached copy for speed but refresh it in the background — otherwise an
  // edit to those files would never reach an already-installed app.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
