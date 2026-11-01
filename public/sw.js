// IronLog service worker: app shell offline + cache of exercise photos and fonts.
// Bump VERSION when shipping changes so clients pick up the new shell.
const VERSION = 'ironlog-v4';
const SHELL = [
  './', 'index.html', 'styles.css', 'app.js', 'i18n.js', 'icons.js', 'programs.js',
  'manifest.webmanifest', 'icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png',
  'data/exercises.json', 'i18n/exercises.es.json',
];
const IMG_CACHE = 'ironlog-img';
const FONT_CACHE = 'ironlog-fonts';
const IMG_HOSTS = ['cdn.jsdelivr.net', 'raw.githubusercontent.com'];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', ev => {
  ev.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', ev => {
  ev.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('ironlog-v') && k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Serve from cache, refresh in the background
async function staleWhileRevalidate(req, cacheName, fetchReq = req) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req, { ignoreSearch: true });
  const net = fetch(fetchReq).then(res => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  }).catch(() => hit);
  return hit || net;
}

// Photos never change: cache once, serve forever
async function cacheFirst(req, cacheName, fetchReq = req) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(fetchReq);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', ev => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    if (url.pathname.includes('/api/')) return; // LAN sync always goes to the network
    if (req.mode === 'navigate') {
      ev.respondWith(fetch(req).catch(() => caches.match('index.html')));
      return;
    }
    ev.respondWith(staleWhileRevalidate(req, VERSION));
    return;
  }
  if (IMG_HOSTS.includes(url.hostname)) {
    // CORS fetch so the cached copy isn't an opaque (quota-heavy) response; both hosts send Access-Control-Allow-Origin: *
    ev.respondWith(cacheFirst(req, IMG_CACHE, new Request(req.url, { mode: 'cors', credentials: 'omit' })));
    return;
  }
  if (FONT_HOSTS.includes(url.hostname)) {
    ev.respondWith(staleWhileRevalidate(req, FONT_CACHE));
  }
});
