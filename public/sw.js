// IronLog service worker: app shell offline + cache of exercise photos and fonts.
// The deploy workflow replaces __BUILD__ with the commit id, so every release gets a fresh shell cache.
const BUILD = '__BUILD__';
const VERSION = `ironlog-shell-${BUILD}`;
const SHELL = [
  './', 'index.html', 'styles.css', 'app.js', 'i18n.js', 'icons.js', 'programs.js',
  'manifest.webmanifest', 'icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png',
  'data/exercises.json', 'i18n/exercises.es.json',
];
const IMG_CACHE = 'ironlog-img';
const FONT_CACHE = 'ironlog-fonts';
const IMG_HOSTS = ['cdn.jsdelivr.net', 'raw.githubusercontent.com'];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

// A new release must never store the previous release's files. cache: 'reload' skips the browser's HTTP cache, and the
// ?v=<build> query makes GitHub's CDN miss too (right after a deploy its edges can still hold the old app.js for minutes).
// Files are stored under their plain URL. If app.js still isn't this release, the install fails and the browser retries later.
async function fetchShell(u) {
  const res = await fetch(new Request(`${u}${u.includes('?') ? '&' : '?'}v=${BUILD}`, { cache: 'reload' }));
  if (!res.ok) throw new Error(`${u}: ${res.status}`);
  if (u === 'app.js' && !BUILD.startsWith('__') && !(await res.clone().text()).includes(`'${BUILD}'`)) throw new Error('app.js is from another release');
  return res;
}
self.addEventListener('install', ev => {
  ev.waitUntil(caches.open(VERSION).then(c => Promise.all(SHELL.map(async u => c.put(u, await fetchShell(u))))));
});

// The first install activates right away; an update waits until the user taps "Reload" in the app
self.addEventListener('message', ev => {
  if (ev.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', ev => {
  const old = k => (k.startsWith('ironlog-shell-') || k.startsWith('ironlog-v')) && k !== VERSION;
  ev.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(old).map(k => caches.delete(k))))
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
