// WanderPlan Service Worker – App-Shell-Cache für Offline-Start und PWA.

const CACHE = 'wanderplan-v10';

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
  // Kein automatisches skipWaiting: Der neue Worker wartet, bis die Seite das
  // Update bestätigt (Banner „Neue Version") und SKIP_WAITING sendet. So bekommt
  // der Nutzer den Hinweis, dass aktualisiert werden muss.
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => { /* einzelne fehlende Datei nicht fatal */ })
  );
});

// Die Seite bittet um sofortige Aktivierung des wartenden Workers.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Tippt der Nutzer auf eine Benachrichtigung → App in den Vordergrund holen
// (oder öffnen). Nötig, damit die über den Service Worker gezeigten
// Benachrichtigungen (u. a. auf dem iPhone) sinnvoll reagieren.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('./');
      return undefined;
    })
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // WICHTIG: Nur eigene Dateien (App-Shell) verwalten. Alles Fremde – vor allem
  // Kartenkacheln, Vektor-Style, Sprites/Glyphs, das Höhenmodell (DEM), die
  // CDN-Skripte und die APIs – unangetastet ans Netz durchreichen.
  //
  // Warum: Karten-Daten dürfen NIE aus dem Cache kommen. Auf dem iPhone ist der
  // Cache-Speicher für Web-Apps klein; wurde er (wie bisher) mit hunderten
  // Kacheln vollgeschrieben, lieferte der Worker veraltete/abgeschnittene Daten
  // aus → die Karte blieb weiß und ruckelte. Durchreichen behebt beides.
  if (url.origin !== self.location.origin) return;

  // Navigationsanfragen: Netzwerk zuerst, offline auf die gecachte Seite zurückfallen.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('index.html').then((r) => r || caches.match('./')))
    );
    return;
  }

  // Eigene statische Dateien: Cache zuerst, dann Netzwerk (und Kopie ablegen).
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return res;
      });
    }).catch(() => caches.match(req))
  );
});
