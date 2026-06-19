// LinguaCall service worker — minimal but valid for PWA install criteria
const CACHE = 'linguacall-v2';
const SHELL = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL).catch(()=>{})));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Fetch handler — required by Chrome for PWA install. Network-first, fall back to cache.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Never cache API calls (worker backend)
  if (url.hostname.includes('workers.dev') || url.hostname.includes('api.')) {
    return; // pass through to network
  }
  e.respondWith(
    fetch(e.request)
      .then(res => {
        // Cache successful same-origin responses
        if (res.ok && url.origin === self.location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy).catch(()=>{}));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});
