// WanderPlan Service Worker – App-Shell-Cache für Offline-Start und PWA.

const CACHE = 'wanderplan-v7';

const SHELL = [
  './',
  'index.html',
  'css/style.css',
  'js/app.js',
  'js/map.js',
  'js/routing.js',
  'js/sensors.js',
  'js/tracking.js',
  'js/elevation.js',
  'js/gpx.js',
  'js/storage.js',
  'js/share.js',
  'js/search.js',
  'js/weather.js',
  'js/poi.js',
  'js/difficulty.js',
  'js/routecodec.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => { /* einzelne fehlende Datei nicht fatal */ })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Navigationsanfragen: Netzwerk zuerst, offline auf die gecachte Seite zurückfallen.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('index.html').then((r) => r || caches.match('./')))
    );
    return;
  }

  // Kartenkacheln nicht cachen (zu viele, zu groß) – nur durchreichen.
  if (/tile\.|\.tile\./.test(url.hostname)) return;

  // Sonst: Cache zuerst, dann Netzwerk (und Kopie ablegen).
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.status === 200 && (url.origin === self.location.origin || res.type === 'cors')) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return res;
      });
    }).catch(() => caches.match(req))
  );
});
