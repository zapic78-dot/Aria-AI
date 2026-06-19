// LinguaCall service worker — minimal, network-first
// Required by PWABuilder / app stores to qualify as an installable PWA.
const CACHE_NAME = 'linguacall-v1';
const PRECACHE = ['./', 'index.html', 'manifest.json', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Never cache API calls — Nova's replies must always be live
  if (event.request.url.includes('workers.dev') || event.request.url.includes('googleapis.com')) {
    return;
  }
  // Network-first for everything else, fall back to cache when offline
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy).catch(() => {}));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
