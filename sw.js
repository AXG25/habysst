// Cache first, then refresh in the background: the app opens instantly even on a weak signal.
// Other files: a new version is fetched in the background and used from the next open.
const CACHE = 'habysst-v13'; // bump to drop old cached files (v3 had font stylesheets mixed up)
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.open(CACHE).then(async cache => {
    // Only the page ignores ?query (e.g. a start URL with parameters). Other URLs differ only by their
    // query, like Google Fonts stylesheets, and must never be mixed up.
    const cached = await cache.match(e.request, { ignoreSearch: e.request.mode === 'navigate' });
    // The page itself: try the network briefly so a new version (and its icon) shows on this open,
    // but never wait more than 2.5 s on a weak signal.
    if (e.request.mode === 'navigate' && cached) {
      const net = fetch(e.request).then(res => { if (res.ok) cache.put(e.request, res.clone()); return res; });
      e.waitUntil(net.catch(() => {}));
      return Promise.race([net, new Promise(r => setTimeout(() => r(cached), 2500))]).catch(() => cached);
    }
    const fresh = fetch(e.request).then(res => {
      if (res.ok || res.type === 'opaque') cache.put(e.request, res.clone());
      return res;
    });
    if (cached) { e.waitUntil(fresh.catch(() => {})); return cached; }
    return fresh.catch(() => cache.match('./'));
  }));
});
