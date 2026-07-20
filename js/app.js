// WanderPlan – Einstiegspunkt: verdrahtet Karte, Routing, Sensoren, Tracking,
// Höhenprofil, GPX, Speicherung, Live-Standort-Teilen und die Oberfläche.

import * as mapView from './map.js';
import { calculateRoute, computeStats, fetchElevations, haversine } from './routing.js';
import * as sensors from './sensors.js';
import * as tracking from './tracking.js';
import { ElevationChart } from './elevation.js';
import { routeToGPX, trackToGPX, parseGPX, downloadGPX } from './gpx.js';
import * as storage from './storage.js';
import * as share from './share.js';

const $ = (id) => document.getElementById(id);

// ---------- Formatierung ----------

function fmtDistance(m) {
  if (m == null) return '–';
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toLocaleString('de-DE', { maximumFractionDigits: m < 10000 ? 2 : 1 })} km`;
}

function fmtDuration(sec) {
  if (sec == null) return '–';
  const h = Math.floor(sec / 3600);
  const min = Math.round((sec % 3600) / 60);
  return h > 0 ? `${h} h ${min} min` : `${min} min`;
}

function fmtClock(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

function fmtSpeed(ms) {
  if (ms == null || Number.isNaN(ms)) return '–';
  return `${(ms * 3.6).toLocaleString('de-DE', { maximumFractionDigits: 1 })} km/h`;
}

function fmtEle(m) {
  return m == null ? '–' : `${Math.round(m)} m`;
}

function fmtAgo(sec) {
  if (sec < 5) return 'gerade eben';
  if (sec < 60) return `vor ${Math.round(sec)} s`;
  const min = Math.floor(sec / 60);
  return `vor ${min} min`;
}

const CARDINALS = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];
function cardinal(deg) {
  return CARDINALS[Math.round(deg / 45) % 8];
}

function bearing(lat1, lon1, lat2, lon2) {
  const toRad = Math.PI / 180;
  const dLon = (lon2 - lon1) * toRad;
  const y = Math.sin(dLon) * Math.cos(lat2 * toRad);
  const x = Math.cos(lat1 * toRad) * Math.sin(lat2 * toRad)
    - Math.sin(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.cos(dLon);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

// ---------- Toast ----------

let toastTimer = null;
function showToast(msg, { error = false, duration = 3500 } = {}) {
  const toast = $('toast');
  toast.textContent = msg;
  toast.classList.toggle('error', error);
  toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add('hidden'), duration);
}

// ---------- Bottom-Sheet ----------

const panel = $('panel');
const mqMobile = window.matchMedia('(max-width: 899px)');

function sheetPx(state) {
  if (state === 'peek') return 78;
  if (state === 'full') return Math.round(window.innerHeight * 0.88);
  return Math.round(window.innerHeight * 0.46);
}

let sheetState = 'half';

function setSheet(state) {
  sheetState = state;
  document.documentElement.style.setProperty('--sheet-h', `${sheetPx(state)}px`);
  panel.classList.toggle('peek', state === 'peek');
  setTimeout(() => mapView.map.invalidateSize(), 260);
}

function ensureExpanded() {
  if (mqMobile.matches && sheetState === 'peek') setSheet('half');
}

(function initSheetDrag() {
  const handle = $('panelHandle');
  let dragging = false;
  let startY = 0;
  let startH = 0;
  let moved = 0;

  handle.addEventListener('pointerdown', (e) => {
    if (!mqMobile.matches) return;
    dragging = true;
    moved = 0;
    startY = e.clientY;
    startH = panel.offsetHeight;
    handle.setPointerCapture(e.pointerId);
    document.body.classList.add('sheet-dragging');
    panel.classList.add('sheet-dragging');
  });

  handle.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dy = e.clientY - startY;
    moved = Math.max(moved, Math.abs(dy));
    const h = Math.min(Math.max(startH - dy, 60), Math.round(window.innerHeight * 0.92));
    document.documentElement.style.setProperty('--sheet-h', `${h}px`);
    panel.classList.toggle('peek', h < 120);
  });

  const end = () => {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove('sheet-dragging');
    panel.classList.remove('sheet-dragging');
    if (moved < 6) {
      // Tap auf den Griff → nächster Zustand
      setSheet(sheetState === 'peek' ? 'half' : sheetState === 'half' ? 'full' : 'peek');
      return;
    }
    // Zum nächstgelegenen Rastpunkt einrasten
    const h = panel.offsetHeight;
    const opts = [['peek', sheetPx('peek')], ['half', sheetPx('half')], ['full', sheetPx('full')]];
    opts.sort((a, b) => Math.abs(a[1] - h) - Math.abs(b[1] - h));
    setSheet(opts[0][0]);
  };

  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
})();

// ---------- Tabs ----------

function switchToTab(tab) {
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-content').forEach((c) => {
    c.classList.toggle('hidden', c.id !== `tab-${tab}`);
  });
}

document.querySelectorAll('.tab').forEach((btn) => {
  btn.addEventListener('click', () => switchToTab(btn.dataset.tab));
});

// ---------- Aktionsleiste ----------

$('actLocate').addEventListener('click', toggleLocate);
$('actRecord').addEventListener('click', () => { switchToTab('tracking'); ensureExpanded(); });
$('actShare').addEventListener('click', () => { switchToTab('share'); ensureExpanded(); });

// ---------- Hilfe-Overlay ----------

function openHelp() { $('helpOverlay').classList.remove('hidden'); }
function closeHelp() { $('helpOverlay').classList.add('hidden'); }

$('helpBtn').addEventListener('click', openHelp);
$('helpClose').addEventListener('click', closeHelp);
$('helpOverlay').addEventListener('click', (e) => {
  if (e.target === $('helpOverlay')) closeHelp();
});

// ---------- Höhenprofil ----------

const chart = new ElevationChart($('elevationChart'), {
  onHover: (lat, lon) => mapView.showHighlight(lat, lon),
  onLeave: () => mapView.hideHighlight(),
});

// ---------- Routenplanung ----------

let currentRoute = null;
let routeRequestId = 0;
let recalcTimer = null;

function setRouteStatus(text, warn = false) {
  const el = $('routeStatus');
  if (!text) { el.classList.add('hidden'); return; }
  el.textContent = text;
  el.classList.toggle('warn', warn);
  el.classList.remove('hidden');
}

function updateRouteStats(stats) {
  $('statDistance').textContent = stats ? fmtDistance(stats.distance) : '–';
  $('statAscent').textContent = stats && stats.ascent != null ? `${stats.ascent} m` : '–';
  $('statDescent').textContent = stats && stats.descent != null ? `${stats.descent} m` : '–';
  $('statDuration').textContent = stats ? fmtDuration(stats.duration) : '–';
}

function showRoute(route) {
  currentRoute = route;
  mapView.drawRoute(route.coords, { fallback: route.fallback });
  updateRouteStats(route.stats);
  const hasProfile = chart.setData(route.coords);
  $('chartEmpty').classList.toggle('hidden', hasProfile);
}

function clearRouteDisplay() {
  currentRoute = null;
  mapView.clearRouteLine();
  mapView.hideHighlight();
  chart.clear();
  $('chartEmpty').classList.remove('hidden');
  updateRouteStats(null);
  setRouteStatus(null);
}

async function recalcRoute() {
  const waypoints = mapView.getWaypoints();
  if (waypoints.length < 2) {
    routeRequestId++;
    clearRouteDisplay();
    return;
  }
  const reqId = ++routeRequestId;
  setRouteStatus('Route wird berechnet …');
  const result = await calculateRoute(waypoints, $('profileSelect').value);
  if (reqId !== routeRequestId) return;
  showRoute({ ...result, source: 'planned' });
  setRouteStatus(
    result.fallback ? '⚠ Routing-Dienst nicht erreichbar – es wird die Luftlinie angezeigt.' : null,
    true
  );
}

mapView.onWaypointsChanged(() => {
  clearTimeout(recalcTimer);
  recalcTimer = setTimeout(recalcRoute, 250);
});

$('profileSelect').addEventListener('change', recalcRoute);
$('btnUndo').addEventListener('click', () => mapView.undoWaypoint());
$('btnReverse').addEventListener('click', () => mapView.reverseWaypoints());
$('btnClear').addEventListener('click', () => {
  mapView.clearWaypoints();
  clearRouteDisplay();
});

// ---------- Route speichern / GPX ----------

$('btnSaveRoute').addEventListener('click', () => {
  if (!currentRoute) {
    showToast('Keine Route vorhanden – setze zuerst Wegpunkte auf der Karte.');
    return;
  }
  const name = prompt('Name der Route:', currentRoute.name || 'Meine Wanderroute');
  if (!name) return;
  const entry = storage.saveRoute({
    name,
    waypoints: mapView.getWaypoints(),
    coords: currentRoute.coords.map((c) => [
      Number(c[0].toFixed(6)), Number(c[1].toFixed(6)), c[2] == null ? null : Math.round(c[2]),
    ]),
    stats: currentRoute.stats,
    profile: $('profileSelect').value,
  });
  if (entry) {
    renderSavedLists();
    showToast(`Route „${name}“ gespeichert.`);
  } else {
    showToast('Speichern fehlgeschlagen (Speicher voll?).', { error: true });
  }
});

$('btnExportRoute').addEventListener('click', () => {
  if (!currentRoute) {
    showToast('Keine Route vorhanden – setze zuerst Wegpunkte auf der Karte.');
    return;
  }
  const name = currentRoute.name || 'wanderroute';
  downloadGPX(name, routeToGPX(name, currentRoute.coords, mapView.getWaypoints()));
});

$('btnImport').addEventListener('click', () => $('fileInput').click());

$('fileInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const parsed = parseGPX(await file.text());
    mapView.clearWaypoints({ silent: true });
    routeRequestId++;
    showRoute({
      coords: parsed.coords,
      stats: computeStats(parsed.coords),
      fallback: false,
      source: 'imported',
      name: parsed.name,
    });
    setRouteStatus(`Importiert: „${parsed.name}“`);
    mapView.fitToCoords(parsed.coords);
    showToast('GPX-Datei geladen. Neue Wegpunkte ersetzen die importierte Route.');
  } catch (err) {
    showToast(`Import fehlgeschlagen: ${err.message}`, { error: true });
  }
});

// ---------- GPS / Standort ----------

let follow = false;
let hadFirstFix = false;
let lastPosition = null;
let lastPositionTime = 0;

function setLocateButton() {
  const on = sensors.gpsRunning();
  $('btnLocate').classList.toggle('active', on);
  $('actLocate').classList.toggle('active', on);
}

function toggleLocate() {
  if (!sensors.gpsAvailable()) {
    showToast('Dein Browser unterstützt keine Standortabfrage.', { error: true });
    return;
  }
  if (!sensors.gpsRunning()) {
    follow = true;
    hadFirstFix = false;
    sensors.startGPS();
    setLocateButton();
    showToast('Standort wird gesucht …');
  } else if (!follow) {
    follow = true;
    if (lastPosition) {
      mapView.map.setView(
        [lastPosition.coords.latitude, lastPosition.coords.longitude],
        Math.max(mapView.map.getZoom(), 15)
      );
    }
  } else if (share.isSharing() || tracking.getState() === 'recording') {
    // GPS wird noch gebraucht → nur Folgen aus
    follow = false;
    showToast('Karte folgt nicht mehr. GPS bleibt für Teilen/Tracking aktiv.');
  } else {
    sensors.stopGPS();
    follow = false;
    mapView.removePosition();
    $('gpsChip').classList.add('hidden');
    setLocateButton();
  }
}

$('btnLocate').addEventListener('click', toggleLocate);
$('vwLocate').addEventListener('click', toggleLocate);

mapView.map.on('dragstart', () => { follow = false; followShared = false; });

sensors.onPosition((pos) => {
  lastPosition = pos;
  lastPositionTime = Date.now();
  const { latitude, longitude, accuracy, speed, altitude } = pos.coords;
  mapView.updatePosition(latitude, longitude, accuracy);

  if (follow) {
    const zoom = hadFirstFix ? mapView.map.getZoom() : 15;
    mapView.map.setView([latitude, longitude], zoom);
  }
  hadFirstFix = true;

  const chip = $('gpsChip');
  chip.textContent = `± ${Math.round(accuracy)} m${speed != null && !Number.isNaN(speed) ? ` · ${fmtSpeed(speed)}` : ''}`;
  chip.classList.remove('hidden');

  updateAltimeter(pos);

  // Live-Tracking mitschreiben
  if (tracking.getState() === 'recording' && tracking.addPosition(pos)) {
    mapView.appendTrackPoint(latitude, longitude);
  }
  $('trkSpeed').textContent = fmtSpeed(speed);
  $('trkAltitude').textContent = fmtEle(altitude);

  // Live-Standort senden
  if (share.isSharing()) {
    share.publishPosition({
      lat: latitude,
      lon: longitude,
      acc: accuracy != null ? Math.round(accuracy) : null,
      alt: altitude != null ? Math.round(altitude) : null,
      speed: speed != null && !Number.isNaN(speed) ? speed : null,
      heading: lastHeading,
      ts: Date.now(),
    });
  }

  if (viewerMode) updateViewerDerived();
});

sensors.onGPSError((err) => {
  if (err.code === 1) {
    sensors.stopGPS();
    setLocateButton();
    let msg = 'Standort-Zugriff verweigert. Bitte in den Browser-Einstellungen erlauben.';
    if (!window.isSecureContext) msg += ' Hinweis: GPS funktioniert nur über HTTPS oder localhost.';
    showToast(msg, { error: true });
    return;
  }
  if (Date.now() - lastPositionTime > 15000) {
    showToast('Kein GPS-Signal – Position wird weiter gesucht …');
  }
});

// ---------- Höhenmesser ----------

let lastTerrainFetch = { time: 0, lat: null, lon: null };

function updateAltimeter(pos) {
  const { altitude, latitude, longitude } = pos.coords;
  if (altitude != null) {
    $('altValue').textContent = fmtEle(altitude);
    $('altimeter').title = 'Höhenmesser – Höhe laut GPS';
  } else {
    fetchTerrainAltitude(latitude, longitude);
  }
}

async function fetchTerrainAltitude(lat, lon) {
  const now = Date.now();
  const moved = lastTerrainFetch.lat == null
    || haversine(lat, lon, lastTerrainFetch.lat, lastTerrainFetch.lon) > 100;
  if (now - lastTerrainFetch.time < 30000 && !moved) return;
  lastTerrainFetch = { time: now, lat, lon };
  try {
    const [ele] = await fetchElevations([[lat, lon]]);
    if (ele != null) {
      $('altValue').textContent = fmtEle(ele);
      $('altimeter').title = 'Höhenmesser – Geländehöhe (Modell, kein GPS-Höhenwert verfügbar)';
    }
  } catch {
    // Höhe bleibt unverändert
  }
}

// ---------- Kompass ----------

let roseRotation = 0;
let lastHeading = null;
let gotCompassData = false;

function handleHeading(heading) {
  gotCompassData = true;
  if (lastHeading === null) {
    roseRotation = -heading;
  } else {
    let delta = heading - lastHeading;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    roseRotation -= delta;
  }
  lastHeading = heading;
  $('compassRose').style.transform = `rotate(${roseRotation}deg)`;
  $('compassText').textContent = `${String(Math.round(heading)).padStart(3, '0')}° ${cardinal(heading)}`;
  mapView.setPositionHeading(heading);
}

$('compassBtn').addEventListener('click', async () => {
  if (sensors.compassEnabled()) return;
  try {
    await sensors.enableCompass(handleHeading);
    showToast('Kompass aktiviert.');
    setTimeout(() => {
      if (!gotCompassData) {
        showToast('Kein Kompass-Sensor gefunden – auf Desktop-Geräten meist nicht vorhanden.');
      }
    }, 3000);
  } catch (err) {
    showToast(err.message, { error: true });
  }
});

// ---------- Live-Tracking ----------

let trackTimer = null;

function updateTrackButtons() {
  const state = tracking.getState();
  $('btnTrackStart').classList.toggle('hidden', state !== 'idle');
  $('btnTrackPause').classList.toggle('hidden', state !== 'recording');
  $('btnTrackResume').classList.toggle('hidden', state !== 'paused');
  $('btnTrackStop').classList.toggle('hidden', state !== 'recording' && state !== 'paused');
  $('trackFinishRow').classList.toggle('hidden', state !== 'finished');
  $('actRecord').classList.toggle('active', state === 'recording' || state === 'paused');
}

function renderTrackStats() {
  const stats = tracking.getStats();
  $('trkDuration').textContent = tracking.getState() === 'idle' ? '–' : fmtClock(stats.duration);
  $('trkDistance').textContent = tracking.getState() === 'idle' ? '–' : fmtDistance(stats.distance);
  $('trkAvgSpeed').textContent = stats.duration > 30 ? fmtSpeed(stats.avgSpeed) : '–';
  $('trkAscent').textContent = tracking.getState() === 'idle' ? '–' : `${stats.ascent} m`;
}

$('btnTrackStart').addEventListener('click', () => {
  mapView.clearTrackLine();
  tracking.start();
  if (!sensors.gpsRunning()) {
    follow = true;
    sensors.startGPS();
    setLocateButton();
  }
  updateTrackButtons();
  trackTimer = setInterval(renderTrackStats, 1000);
  showToast('Aufzeichnung gestartet – gute Wanderung!');
});

$('btnTrackPause').addEventListener('click', () => { tracking.pause(); updateTrackButtons(); });
$('btnTrackResume').addEventListener('click', () => { tracking.resume(); updateTrackButtons(); });

$('btnTrackStop').addEventListener('click', () => {
  tracking.stop();
  clearInterval(trackTimer);
  renderTrackStats();
  updateTrackButtons();
  if (tracking.getPoints().length < 2) {
    showToast('Es wurden keine Positionen aufgezeichnet.');
  }
});

$('btnTrackSave').addEventListener('click', () => {
  const points = tracking.getPoints();
  if (points.length < 2) {
    showToast('Der Track enthält zu wenige Punkte zum Speichern.');
    return;
  }
  const defaultName = `Wanderung ${new Date().toLocaleDateString('de-DE')}`;
  const name = prompt('Name des Tracks:', defaultName);
  if (!name) return;
  const stats = tracking.getStats();
  const entry = storage.saveTrack({
    name,
    points,
    stats: {
      distance: Math.round(stats.distance),
      duration: Math.round(stats.duration),
      ascent: stats.ascent,
      descent: stats.descent,
    },
  });
  if (entry) {
    tracking.discard();
    mapView.clearTrackLine();
    updateTrackButtons();
    renderTrackStats();
    renderSavedLists();
    showToast(`Track „${name}“ gespeichert.`);
  } else {
    showToast('Speichern fehlgeschlagen (Speicher voll?).', { error: true });
  }
});

$('btnTrackExport').addEventListener('click', () => {
  const points = tracking.getPoints();
  if (points.length < 2) {
    showToast('Der Track enthält zu wenige Punkte für einen Export.');
    return;
  }
  const name = `wanderung-${new Date().toISOString().slice(0, 10)}`;
  downloadGPX(name, trackToGPX(name, points));
});

$('btnTrackDiscard').addEventListener('click', () => {
  if (!confirm('Aufzeichnung wirklich verwerfen?')) return;
  tracking.discard();
  mapView.clearTrackLine();
  updateTrackButtons();
  renderTrackStats();
});

window.addEventListener('beforeunload', (e) => {
  if (tracking.getState() === 'recording' || tracking.getState() === 'paused' || share.isSharing()) {
    e.preventDefault();
  }
});

// ---------- Live-Standort teilen (Sender) ----------

let shareLink = '';

function setShareStatus(state, text) {
  const el = $('shareStatus');
  const map = {
    connecting: ['status share-status', '⏳ Verbinde mit Server …'],
    live: ['status share-status ok', '🟢 Standort wird geteilt'],
    reconnecting: ['status share-status warn', '🔄 Verbindung verloren – neuer Versuch …'],
    error: ['status share-status err', '⚠ ' + (text || 'Fehler')],
    waiting: ['status share-status', '⏳ Warte auf GPS-Position …'],
  };
  if (state === 'stopped') return;
  const [cls, defText] = map[state] || ['status share-status', text || ''];
  el.className = cls;
  el.textContent = text && state === 'error' ? '⚠ ' + text : defText;
  $('actShare').classList.toggle('active', share.isSharing());
}

$('btnShareStart').addEventListener('click', () => {
  if (!window.isSecureContext) {
    showToast('Teilen braucht HTTPS. Öffne die Seite über die veröffentlichte HTTPS-Adresse.', { error: true, duration: 6000 });
    return;
  }
  if (!sensors.gpsAvailable()) {
    showToast('Dein Browser unterstützt keine Standortabfrage.', { error: true });
    return;
  }
  shareLink = share.startSharing({
    name: $('shareName').value.trim(),
    onStatus: setShareStatus,
  });
  $('shareLink').value = shareLink;
  $('shareIdle').classList.add('hidden');
  $('shareActive').classList.remove('hidden');
  $('actShare').classList.add('active');
  if (!sensors.gpsRunning()) {
    sensors.startGPS();
    setLocateButton();
  }
  setShareStatus('waiting');
  showToast('Teilen gestartet. Schick den Link an deine Begleiter.', { duration: 5000 });
});

$('btnShareStop').addEventListener('click', () => {
  share.stopSharing();
  $('shareActive').classList.add('hidden');
  $('shareIdle').classList.remove('hidden');
  $('actShare').classList.remove('active');
  showToast('Teilen beendet.');
});

$('btnShareCopy').addEventListener('click', () => copyLink(shareLink));
$('btnShareNative').addEventListener('click', async () => {
  const data = { title: 'WanderPlan – mein Live-Standort', text: 'Verfolge meine Wanderung live:', url: shareLink };
  if (navigator.share) {
    try { await navigator.share(data); } catch { /* abgebrochen */ }
  } else {
    copyLink(shareLink);
  }
});

async function copyLink(link) {
  try {
    await navigator.clipboard.writeText(link);
    showToast('Link kopiert.');
  } catch {
    const inp = $('shareLink');
    inp.focus();
    inp.select();
    try { document.execCommand('copy'); showToast('Link kopiert.'); }
    catch { showToast('Bitte Link manuell kopieren.'); }
  }
}

// ---------- Gespeicherte Routen & Tracks ----------

function renderList(listEl, items, emptyText, actions) {
  listEl.innerHTML = '';
  if (items.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = emptyText;
    listEl.appendChild(li);
    return;
  }
  for (const item of items) {
    const li = document.createElement('li');
    li.className = 'item';
    const info = document.createElement('div');
    info.className = 'item-info';
    const nameEl = document.createElement('div');
    nameEl.className = 'item-name';
    nameEl.textContent = item.name;
    const metaEl = document.createElement('div');
    metaEl.className = 'item-meta';
    const date = new Date(item.createdAt).toLocaleDateString('de-DE');
    metaEl.textContent = `${fmtDistance(item.stats?.distance)} · ${date}`;
    info.append(nameEl, metaEl);
    li.appendChild(info);
    for (const [label, title, cls, fn] of actions) {
      const btn = document.createElement('button');
      btn.className = `item-btn ${cls}`;
      btn.textContent = label;
      btn.title = title;
      btn.addEventListener('click', () => fn(item));
      li.appendChild(btn);
    }
    listEl.appendChild(li);
  }
}

function loadSavedRoute(route) {
  switchToTab('route');
  ensureExpanded();
  if (route.profile) $('profileSelect').value = route.profile;
  if (route.waypoints && route.waypoints.length >= 2) {
    mapView.setWaypoints(route.waypoints);
  } else {
    mapView.clearWaypoints({ silent: true });
    routeRequestId++;
    showRoute({ coords: route.coords, stats: route.stats, fallback: false, source: 'imported', name: route.name });
  }
  mapView.fitToCoords(route.coords);
  showToast(`Route „${route.name}“ geladen.`);
}

function loadSavedTrack(track) {
  if (tracking.getState() === 'recording' || tracking.getState() === 'paused') {
    showToast('Während einer laufenden Aufzeichnung können keine Tracks geladen werden.');
    return;
  }
  const coords = track.points.map((p) => [p.lat, p.lon]);
  mapView.setTrack(coords);
  mapView.fitToCoords(coords);
  showToast(`Track „${track.name}“ – ${fmtDistance(track.stats?.distance)} in ${fmtDuration(track.stats?.duration)}.`, { duration: 5000 });
}

function renderSavedLists() {
  renderList($('routeList'), storage.listRoutes(), 'Noch keine Routen gespeichert.', [
    ['Laden', 'Route auf der Karte anzeigen', '', loadSavedRoute],
    ['GPX', 'Als GPX-Datei exportieren', '', (r) => downloadGPX(r.name, routeToGPX(r.name, r.coords, r.waypoints || []))],
    ['🗑', 'Route löschen', 'danger', (r) => {
      if (confirm(`Route „${r.name}“ löschen?`)) { storage.deleteRoute(r.id); renderSavedLists(); }
    }],
  ]);
  renderList($('trackList'), storage.listTracks(), 'Noch keine Tracks aufgezeichnet.', [
    ['Laden', 'Track auf der Karte anzeigen', '', loadSavedTrack],
    ['GPX', 'Als GPX-Datei exportieren', '', (t) => downloadGPX(t.name, trackToGPX(t.name, t.points))],
    ['🗑', 'Track löschen', 'danger', (t) => {
      if (confirm(`Track „${t.name}“ löschen?`)) { storage.deleteTrack(t.id); renderSavedLists(); }
    }],
  ]);
}

// ---------- Betrachter-Modus (?share=TOKEN) ----------

let viewerMode = false;
let followShared = true;
let sharedData = null;
let sharedTs = 0;
let viewerTimer = null;
let viewerEnded = false;

function initViewer(token) {
  viewerMode = true;
  document.body.classList.add('viewer-mode');
  mapView.setMapClickEnabled(false);
  $('viewerCard').classList.remove('hidden');
  $('btnCenterShared').classList.remove('hidden');

  share.startViewing(token, { onMessage: onSharedMessage, onStatus: onViewerStatus });

  $('btnCenterShared').addEventListener('click', () => {
    if (sharedData) {
      followShared = true;
      mapView.panTo(sharedData.lat, sharedData.lon, Math.max(mapView.map.getZoom(), 15));
    }
  });

  viewerTimer = setInterval(updateViewerDerived, 1000);
}

function onSharedMessage(data) {
  sharedData = data;
  sharedTs = Date.now();
  viewerEnded = false;
  const label = data.name ? `${data.name}` : 'Geteilter Standort';
  mapView.updateSharedPosition(data.lat, data.lon, data.acc, label);
  if (data.name) $('viewerTitle').textContent = data.name;
  if (followShared) {
    mapView.panTo(data.lat, data.lon, Math.max(mapView.map.getZoom(), 15));
  }
  $('vwSpeed').textContent = fmtSpeed(data.speed);
  $('vwAltitude').textContent = fmtEle(data.alt);
  updateViewerDerived();
}

function onViewerStatus(state, text) {
  const el = $('viewerStatus');
  const messages = {
    connecting: 'Verbinde mit Server …',
    waiting: 'Verbunden – warte auf Standort …',
    live: null,
    reconnecting: 'Verbindung unterbrochen – neuer Versuch …',
    ended: 'Der Sender hat das Teilen beendet.',
    error: text || 'Verbindungsfehler.',
  };
  if (state === 'ended') viewerEnded = true;
  if (state === 'live') { viewerEnded = false; updateViewerDerived(); return; }
  const m = messages[state];
  if (m != null) el.textContent = m;
}

function updateViewerDerived() {
  if (!viewerMode) return;
  if (viewerEnded) return;
  if (!sharedData) return;
  const ageSec = (Date.now() - sharedTs) / 1000;
  $('vwUpdated').textContent = fmtAgo(ageSec);

  const el = $('viewerStatus');
  if (ageSec > 30) {
    el.textContent = '⚠ Seit einer Weile keine neue Position – evtl. Bildschirm aus oder offline.';
  } else {
    el.textContent = '🟢 Live – Standort aktuell.';
  }

  if (lastPosition) {
    const d = haversine(
      lastPosition.coords.latitude, lastPosition.coords.longitude,
      sharedData.lat, sharedData.lon
    );
    const b = bearing(
      lastPosition.coords.latitude, lastPosition.coords.longitude,
      sharedData.lat, sharedData.lon
    );
    $('vwDistance').textContent = `${fmtDistance(d)} ${cardinal(b)}`;
  } else {
    $('vwDistance').textContent = 'Standort teilen →';
  }
}

// ---------- Service Worker (PWA) ----------

if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline-Funktion optional */ });
  });
}

// ---------- Start ----------

renderSavedLists();
updateTrackButtons();
setSheet('half');

const shareToken = new URLSearchParams(location.search).get('share');

if (shareToken) {
  initViewer(shareToken);
} else if (!window.isSecureContext) {
  showToast('Hinweis: GPS, Kompass und Teilen funktionieren nur über HTTPS oder localhost.', { duration: 6000 });
} else if (!localStorage.getItem('wanderplan.seenHelp')) {
  localStorage.setItem('wanderplan.seenHelp', '1');
  openHelp();
}
