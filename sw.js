// WanderPlan Service Worker – App-Shell-Cache für Offline-Start und PWA.

const CACHE = 'wanderplan-v19';

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
  'js/i18n.js',
  'js/trails.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  // Sofort aktivieren (skipWaiting): So bekommen ALLE Nutzer einen Fix bzw. neue
  // Version automatisch beim nächsten Öffnen – niemand bleibt auf einer alten,
  // kaputten (gecachten) Fassung hängen. Die Seite zeigt danach kurz einen
  // Hinweis „aktualisiert" und lädt sich einmalig frisch.
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
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
      // Alte App-Caches aufräumen – den Kachel-Cache aber BEHALTEN, damit die
      // Karte nach einem Update nicht komplett neu geladen werden muss.
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE && k !== TILE_CACHE).map((k) => caches.delete(k))
      ))
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

  // Kartenkacheln: aus einem EIGENEN, streng begrenzten Cache bedienen. Dadurch
  // ist die Karte nach einem Neuladen sofort wieder da (kein Nachladen, kein
  // Ruckeln), ohne den App-Cache zu belasten.
  // Wichtig: schlägt irgendetwas fehl, wird IMMER normal aus dem Netz geladen –
  // die Karte darf durch den Cache niemals kaputtgehen.
  if (isTileRequest(url)) { event.respondWith(tileCacheFirst(req)); return; }

  // Alles andere Fremde – Style, CDN-Skripte, APIs – unangetastet durchreichen.
  if (url.origin !== self.location.origin) return;

  // Eigene Dateien (HTML/JS/CSS): NETZWERK ZUERST. Damit kommen Updates SOFORT
  // an, sobald man online ist – niemand bleibt mehr auf einer alten, kaputten
  // Fassung hängen (das war der Grund, warum „Updates nicht gingen"). Der Cache
  // dient nur noch als Offline-Reserve bzw. bei langsamer Verbindung (Timeout).
  event.respondWith(networkFirst(req));
});

// ---------- Kartenkachel-Cache (eigener, begrenzter Speicher) ----------
const TILE_CACHE = 'wanderplan-tiles-v1';
const TILE_LIMIT = 600; // grob 30–60 MB – genug für die Umgebung, schont iOS

function isTileRequest(url) {
  const h = url.hostname, p = url.pathname;
  if (h.includes('tiles.openfreemap.org')) return /\.(pbf|png|jpg|webp)$/.test(p);
  if (h.includes('elevation-tiles-prod')) return true;           // Höhenmodell
  if (h.includes('opentopomap.org')) return true;                // Topo-Raster
  if (h.includes('arcgisonline.com')) return /\/tile\//.test(p); // Satellit/Topo
  return false;
}

// Ältestes zuerst löschen, sobald das Limit überschritten ist.
async function trimTileCache(cache) {
  try {
    const keys = await cache.keys();
    if (keys.length <= TILE_LIMIT) return;
    const excess = keys.length - TILE_LIMIT;
    for (let i = 0; i < excess; i++) await cache.delete(keys[i]);
  } catch { /* egal */ }
}

// Cache zuerst (Kacheln ändern sich praktisch nie), sonst Netz + ablegen.
async function tileCacheFirst(req) {
  try {
    const cache = await caches.open(TILE_CACHE);
    const hit = await cache.match(req);
    if (hit) return hit;
    const res = await fetch(req);
    if (res && res.status === 200) {
      cache.put(req, res.clone()).then(() => trimTileCache(cache)).catch(() => {});
    }
    return res;
  } catch {
    // Cache-API nicht verfügbar/voll → ganz normal aus dem Netz.
    return fetch(req);
  }
}

function networkFirst(req) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (r) => { if (!settled && r) { settled = true; resolve(r); } };
    const serveCache = () => caches.match(req)
      .then((c) => c || (req.mode === 'navigate' ? caches.match('index.html').then((i) => i || caches.match('./')) : null))
      .then((c) => { if (c) done(c); else if (!settled) { settled = true; resolve(fetch(req).catch(() => new Response('', { status: 504 }))); } });
    // Bei langsamer Verbindung nach 4 s aus dem Cache bedienen.
    const timer = setTimeout(serveCache, 4000);
    fetch(req).then((res) => {
      clearTimeout(timer);
      if (res && res.status === 200) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      }
      done(res);
    }).catch(() => { clearTimeout(timer); serveCache(); });
  });
}
