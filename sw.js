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

// Reminders sent by worker/: { habits: [{ id, n: name, m: message, a: 'done' | 'plus' | '' }] }, or { test: true } right after turning them on.
// One notification per habit, so each gets its own «Hecho» button (Android; iPhone shows no buttons).
self.addEventListener('push', e => {
  let m = {};
  try { m = e.data?.json() ?? {}; } catch {}
  const show = (title, body, id = '', a = '') => self.registration.showNotification(title, {
    body, icon: 'icons/logo-192.png', badge: 'icons/badge-96.png', tag: `habysst-${id || title}`, data: { id },
    actions: id && a ? [{ action: a, title: a === 'plus' ? '+1' : 'Hecho' }] : [],
  });
  const list = m.test ? [] : (m.habits ?? []).filter(h => h && typeof h.n === 'string');
  e.waitUntil(m.test || !list.length
    ? show('Avisos activados', 'Así te avisaremos a la hora de cada hábito.')
    : Promise.all(list.map(h => show(h.n, h.m || 'Es la hora. Márcalo en HabyssT cuando lo hagas.', h.id, h.a ?? 'done'))));
});

// «Hecho» and «+1» are queued in the app's IndexedDB (store.js takePending) and applied the next time the app opens.
const idb = fn => new Promise((res, rej) => {
  const r = indexedDB.open('habysst', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('kv');
  r.onerror = () => rej(r.error);
  r.onsuccess = () => {
    const tx = r.result.transaction('kv', 'readwrite');
    fn(tx.objectStore('kv'));
    tx.oncomplete = () => { r.result.close(); res(); };
    tx.onerror = () => rej(tx.error);
  };
});
const markDone = (id, a) => idb(store => {
  const get = store.get('pending');
  get.onsuccess = () => store.put([...(get.result ?? []), { h: id, d: new Date().toLocaleDateString('sv'), a }], 'pending');
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const id = e.notification.data?.id;
  if ((e.action === 'done' || e.action === 'plus') && id) return e.waitUntil(markDone(id, e.action).then(() => clients.matchAll({ type: 'window' })).then(list => list.forEach(c => c.postMessage('pending'))));
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => list[0]?.focus() ?? clients.openWindow('./')));
});
