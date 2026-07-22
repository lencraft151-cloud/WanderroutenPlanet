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
import { searchPlaces, reverseGeocode, kindEmoji } from './search.js';
import { fetchWeather, weatherInfo } from './weather.js';
import { fetchPois } from './poi.js';
import { computeDifficulty, buildGradeSegments } from './difficulty.js';
import { buildRouteLink, decodeRoute } from './routecodec.js';
import { fetchHikingRoutes } from './trails.js';
import { t, setLang, getLang, applyStatic, toggleLang } from './i18n.js';

const $ = (id) => document.getElementById(id);

// ---------- Formatierung ----------

function fmtDistance(m) {
  if (m == null) return '–';
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toLocaleString('de-DE', { maximumFractionDigits: m < 10000 ? 2 : 1 })} km`;
}

function fmtDuration(sec) {
  if (sec == null) return '–';
  // Erst auf ganze Minuten runden, dann teilen – sonst entsteht „2 h 60 min".
  const totalMin = Math.round(sec / 60);
  const h = Math.floor(totalMin / 60);
  const min = totalMin % 60;
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
  setTimeout(() => mapView.resize(), 260);
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
  updateRouteExtras(route);
  maybeShareRoute();
  buildManeuvers(route.coords);
  updateTurnByTurn();
}

function clearRouteDisplay() {
  currentRoute = null;
  mapView.clearRouteLine();
  mapView.hideHighlight();
  chart.clear();
  $('chartEmpty').classList.remove('hidden');
  updateRouteStats(null);
  setRouteStatus(null);
  stopFlyover();
  mapView.clearRouteGrade();
  $('routeExtras').classList.add('hidden');
  maneuvers = []; routeCum = []; hideTurn();
  if (share.isSharing() && $('shareRouteToggle') && $('shareRouteToggle').checked) share.publishRoute(null);
}

// Route an Live-Betrachter senden, wenn Teilen aktiv und der Schalter an ist.
// Auf ~180 Punkte ausdünnen, damit die Nachricht kompakt bleibt.
function maybeShareRoute() {
  const toggle = $('shareRouteToggle');
  if (!toggle || !toggle.checked || !share.isSharing() || !currentRoute) return;
  const coords = currentRoute.coords;
  const step = Math.max(1, Math.ceil(coords.length / 180));
  const simplified = coords.filter((_, i) => i % step === 0 || i === coords.length - 1).map((c) => [c[0], c[1]]);
  share.publishRoute(simplified);
}

// Schwierigkeits-Badge + Steigungs-Segmente aktualisieren.
function updateRouteExtras(route) {
  const extras = $('routeExtras');
  const diff = computeDifficulty(route.coords, route.stats);
  if (!diff) { extras.classList.add('hidden'); mapView.clearRouteGrade(); return; }
  const badge = $('diffBadge');
  badge.textContent = `${diff.grade} · ${diff.label} · max ${diff.maxGrade}%`;
  badge.style.background = diff.color;
  extras.classList.remove('hidden');
  // Steigungs-Overlay vorbereiten (Sichtbarkeit steuert der Umschalter).
  mapView.drawRouteGrade(buildGradeSegments(route.coords));
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
  // Wegpunkte GENAU auf den berechneten Weg ziehen (nicht daneben).
  if (!result.fallback) { mapView.snapWaypointsToRoute(result.coords); renderWaypointList(); }
  setRouteStatus(
    result.fallback ? '⚠ Routing-Dienst nicht erreichbar – es wird die Luftlinie angezeigt.' : null,
    true
  );
}

let wpNames = []; // optionale Namen, an die Wegpunkt-Reihenfolge gebunden

mapView.onWaypointsChanged(() => {
  clearTimeout(recalcTimer);
  recalcTimer = setTimeout(recalcRoute, 250);
  updateBackChip();
  renderWaypointList();
});

$('profileSelect').addEventListener('change', recalcRoute);
$('btnUndo').addEventListener('click', () => mapView.undoWaypoint());
$('btnReverse').addEventListener('click', () => { wpNames.reverse(); mapView.reverseWaypoints(); });
$('btnClear').addEventListener('click', () => {
  wpNames = [];
  mapView.clearWaypoints();
  clearRouteDisplay();
});

// ---------- Wegpunkt-Liste (umsortieren, löschen, benennen) ----------

function defaultWpLabel(i, total) {
  if (i === 0) return 'Start';
  if (i === total - 1) return 'Ziel';
  return `Stopp ${i}`;
}

function renderWaypointList() {
  const ul = $('waypointList');
  const wps = mapView.getWaypoints();
  // Namen-Array an aktuelle Länge angleichen.
  if (wpNames.length > wps.length) wpNames.length = wps.length;
  while (wpNames.length < wps.length) wpNames.push('');
  ul.innerHTML = '';
  if (wps.length === 0) { ul.classList.add('hidden'); return; }
  ul.classList.remove('hidden');
  wps.forEach((w, i) => {
    const li = document.createElement('li');
    const badge = document.createElement('span');
    badge.className = 'wp-badge' + (i === 0 ? ' start' : i === wps.length - 1 ? ' end' : '');
    badge.textContent = i === 0 ? 'S' : i === wps.length - 1 ? 'Z' : String(i);
    const name = document.createElement('input');
    name.className = 'wp-name';
    name.value = wpNames[i] || defaultWpLabel(i, wps.length);
    name.title = `${w.lat.toFixed(4)}, ${w.lng.toFixed(4)}`;
    name.addEventListener('change', () => { wpNames[i] = name.value.trim(); });
    const btns = document.createElement('span');
    btns.className = 'wp-btns';
    const up = document.createElement('button'); up.textContent = '▲'; up.title = 'nach oben'; up.disabled = i === 0;
    up.addEventListener('click', () => moveWaypoint(i, -1));
    const down = document.createElement('button'); down.textContent = '▼'; down.title = 'nach unten'; down.disabled = i === wps.length - 1;
    down.addEventListener('click', () => moveWaypoint(i, 1));
    const del = document.createElement('button'); del.textContent = '✕'; del.title = 'entfernen';
    del.addEventListener('click', () => removeWaypoint(i));
    btns.append(up, down, del);
    li.append(badge, name, btns);
    ul.appendChild(li);
  });
}

function moveWaypoint(i, dir) {
  const wps = mapView.getWaypoints();
  const j = i + dir;
  if (j < 0 || j >= wps.length) return;
  [wps[i], wps[j]] = [wps[j], wps[i]];
  [wpNames[i], wpNames[j]] = [wpNames[j] || '', wpNames[i] || ''];
  mapView.setWaypoints(wps);
}

function removeWaypoint(i) {
  const wps = mapView.getWaypoints();
  wps.splice(i, 1);
  wpNames.splice(i, 1);
  if (wps.length) mapView.setWaypoints(wps);
  else { mapView.clearWaypoints(); clearRouteDisplay(); }
}

// „Mein Standort als Start" – stellt die eigene Position als Wegpunkt 1 voran.
$('btnStartHere').addEventListener('click', () => {
  whenLocated(() => {
    const me = { lat: lastPosition.coords.latitude, lng: lastPosition.coords.longitude };
    const wps = mapView.getWaypoints();
    mapView.setWaypoints([me, ...wps]);
    wpNames = ['Mein Standort', ...wpNames];
    switchToTab('route');
    showToast('📍 Dein Standort ist jetzt der Startpunkt.');
  });
});

// ---------- Route als Link teilen ----------

async function shareOrCopyText(title, url) {
  if (navigator.share) { try { await navigator.share({ title, url }); return; } catch { /* abgebrochen */ } }
  try { await navigator.clipboard.writeText(url); showToast('🔗 Route-Link kopiert.'); }
  catch { window.prompt('Route-Link kopieren:', url); }
}

$('btnRouteLink').addEventListener('click', () => {
  const wps = mapView.getWaypoints();
  if (wps.length < 2) { showToast('Erst eine Route mit mindestens 2 Wegpunkten planen.'); return; }
  shareOrCopyText('WanderPlan – geplante Route', buildRouteLink($('profileSelect').value, wps));
});

$('shareRouteToggle').addEventListener('change', () => {
  if (!share.isSharing()) {
    if ($('shareRouteToggle').checked) showToast('Wird gesendet, sobald du „Live-Standort teilen" startest.');
    return;
  }
  if ($('shareRouteToggle').checked) { maybeShareRoute(); showToast('🗺 Deine Route wird jetzt mitgesendet.'); }
  else { share.publishRoute(null); showToast('Route wird nicht mehr mitgesendet.'); }
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
let navMode = false; // Heading-Up (Karte dreht in Blickrichtung)
let hadFirstFix = false;
let lastPosition = null;
let lastPositionTime = 0;
let autoCenterPending = false;
const RECENTER_DIST = 60; // ab so vielen Metern Abstand „Zurück zu mir" zeigen

// Startet die Ortung automatisch, damit der eigene blaue Punkt erscheint;
// zentriert einmalig auf den ersten Fix, ohne dauerhaft zu folgen.
function autoLocate() {
  if (!sensors.gpsAvailable() || sensors.gpsRunning()) return;
  autoCenterPending = true;
  sensors.startGPS();
  setLocateButton();
}

// Führt fn sofort aus, wenn die Position bekannt ist – sonst nach dem ersten Fix.
let onNextFix = [];
function whenLocated(fn) {
  if (lastPosition) { fn(); return; }
  onNextFix.push(fn);
  if (!sensors.gpsAvailable()) { showToast('Standort nicht verfügbar.', { error: true }); onNextFix = []; return; }
  autoLocate();
  showToast('Standort wird gesucht …');
}

function getOwnName() {
  const v = $('shareName') && $('shareName').value.trim();
  return v || localStorage.getItem('wanderplan.name') || '';
}

function setLocateButton() {
  const on = sensors.gpsRunning();
  $('btnLocate').classList.toggle('active', on);
  $('actLocate').classList.toggle('active', on);
}

// Zentriert auf die eigene Position und aktiviert das Folgen. Schaltet das GPS
// NIE versehentlich aus – so bleibt man zuverlässig „auf seinem Punkt".
function recenterOnMe() {
  follow = true;
  if (lastPosition) {
    mapView.followTo(
      lastPosition.coords.latitude, lastPosition.coords.longitude,
      { zoom: Math.max(mapView.getZoom(), 15), bearing: navMode ? lastHeading : 0 }
    );
  }
  updateRecenterChip();
  setLocateButton();
}

function toggleLocate() {
  if (!sensors.gpsAvailable()) {
    showToast('Dein Browser unterstützt keine Standortabfrage.', { error: true });
    return;
  }
  if (!sensors.gpsRunning()) {
    // 1) GPS aus → starten und folgen
    follow = true;
    hadFirstFix = false;
    sensors.startGPS();
    setLocateButton();
    showToast('Standort wird gesucht …');
  } else if (!follow) {
    // 2) GPS an, aber weggeschoben → zurück und folgen
    recenterOnMe();
  } else {
    // 3) folgt bereits → Folgen pausieren (Punkt & GPS bleiben)
    follow = false;
    updateRecenterChip();
    showToast('Folgen pausiert. Tipp erneut oder „Zurück zu mir", um weiterzugehen.');
  }
}

// Langer Druck auf den Ortungs-Knopf → GPS wirklich ausschalten (Akku sparen).
function stopLocate() {
  if (share.isSharing() || tracking.getState() === 'recording') {
    showToast('GPS bleibt für Teilen/Tracking aktiv.');
    return;
  }
  sensors.stopGPS();
  follow = false;
  mapView.removePosition();
  $('gpsChip').classList.add('hidden');
  updateRecenterChip();
  setLocateButton();
  showToast('Ortung ausgeschaltet.');
}

$('btnLocate').addEventListener('click', toggleLocate);
$('vwLocate').addEventListener('click', toggleLocate);
attachLongPress($('btnLocate'), stopLocate);

$('recenterChip').addEventListener('click', recenterOnMe);

// „Zurück zu mir" zeigen, wenn GPS aktiv ist und die Karte von der eigenen
// Position weggeschoben wurde.
function updateRecenterChip() {
  const chip = $('recenterChip');
  if (!chip) return;
  const show = sensors.gpsRunning() && lastPosition && !follow
    && mapView.distanceToCenter(lastPosition.coords.latitude, lastPosition.coords.longitude) > RECENTER_DIST;
  chip.classList.toggle('hidden', !show);
}

// Kleiner Long-Press-Helfer (Maus & Touch).
function attachLongPress(el, fn, ms = 550) {
  let timer = null;
  let fired = false;
  const start = () => { fired = false; timer = setTimeout(() => { timer = null; fired = true; fn(); }, ms); };
  const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
  el.addEventListener('touchstart', start, { passive: true });
  el.addEventListener('touchend', cancel);
  el.addEventListener('touchmove', cancel);
  el.addEventListener('mousedown', start);
  el.addEventListener('mouseup', cancel);
  el.addEventListener('mouseleave', cancel);
  // Den Klick, der direkt nach einem Long-Press kommt, verwerfen (sonst würde
  // z. B. der Ortungs-Knopf sofort wieder starten).
  el.addEventListener('click', (e) => {
    if (fired) { fired = false; e.stopImmediatePropagation(); e.preventDefault(); }
  }, true);
}

mapView.onDragStart(() => { follow = false; followShared = false; });
mapView.onMoveEnd(updateRecenterChip);

sensors.onPosition((pos) => {
  lastPosition = pos;
  lastPositionTime = Date.now();
  if (onNextFix.length) { const cbs = onNextFix; onNextFix = []; cbs.forEach((fn) => { try { fn(); } catch {} }); }
  const { latitude, longitude, accuracy, speed, altitude } = pos.coords;
  mapView.updatePosition(latitude, longitude, accuracy);
  mapView.setPositionLabel(getOwnName());

  if (follow) {
    const zoom = hadFirstFix ? mapView.getZoom() : 15;
    mapView.followTo(latitude, longitude, { zoom, bearing: navMode ? lastHeading : undefined });
  } else if (autoCenterPending) {
    autoCenterPending = false;
    mapView.setView(latitude, longitude, Math.max(mapView.getZoom(), 14));
  }
  hadFirstFix = true;
  updateRecenterChip();
  updateTurnByTurn();

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

  // Live-Standort senden (solo oder Gruppe)
  const outPos = {
    lat: latitude,
    lon: longitude,
    acc: accuracy != null ? Math.round(accuracy) : null,
    alt: altitude != null ? Math.round(altitude) : null,
    speed: speed != null && !Number.isNaN(speed) ? speed : null,
    heading: lastHeading,
    ts: Date.now(),
  };
  if (share.isSharing()) share.publishPosition(outPos);
  if (share.inGroup()) share.publishGroupPosition(outPos);

  if (viewerMode) updateViewerDerived();
  updateTargetChip();
  updateConnector();
  updateBackChip();
  updateNav();
  updateWeather(latitude, longitude);
});

sensors.onGPSError((err) => {
  if (err.code === 1) {
    sensors.stopGPS();
    setLocateButton();
    onNextFix = []; // wartende Aktionen (Auto-Route etc.) verwerfen
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
  $('compassText').classList.remove('hidden');
  $('compassRose').style.transform = `rotate(${roseRotation}deg)`;
  $('compassText').textContent = `${String(Math.round(heading)).padStart(3, '0')}° ${cardinal(heading)}`;
  mapView.setPositionHeading(heading);
  // Navigations-Modus: Karte in Blickrichtung drehen (Heading-Up).
  if (navMode) mapView.setBearing(heading);
  updateNav();
}

// ---------- Navigations-Modus (Heading-Up) ----------

$('btnNav').addEventListener('click', async () => {
  navMode = !navMode;
  $('btnNav').classList.toggle('active', navMode);
  if (navMode) {
    // Kompass für die Blickrichtung aktivieren (falls noch nicht an).
    if (!sensors.compassEnabled()) {
      try { await sensors.enableCompass(handleHeading); } catch (err) { showToast(err.message, { error: true }); }
    }
    if (!mapView.is3D()) { mapView.toggle3D(); syncBtn3d(); }
    if (!sensors.gpsRunning()) { follow = true; hadFirstFix = false; sensors.startGPS(); setLocateButton(); }
    else { follow = true; updateRecenterChip(); } // Nachführen übernimmt das nächste GPS-Update (kein doppeltes easeTo)
    showToast('🧭 Navigations-Modus: Karte dreht sich in Blickrichtung.', { duration: 4000 });
    // In der installierten App: Benachrichtigungen für Abbiege-Ansagen freigeben.
    if (isInstalledApp()) { ensureNotifyPermission(); }
    else if (!navHintShown) {
      navHintShown = true;
      showToast('💡 Abbiege-Ansagen („in 150 m rechts …") gibt es in der WanderPlan-App.', { duration: 6000 });
    }
    updateTurnByTurn();
  } else {
    mapView.setBearing(0);
    hideTurn();
    try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch {}
    showToast('Navigations-Modus aus (Karte wieder genordet).');
  }
});
let navHintShown = false;

// ---------- Abbiege-Navigation (Turn-by-Turn) – Ansagen nur in der App ----------

function isNativeApp() {
  try { return !!(window.WanderPlanNative && typeof WanderPlanNative.isNativeApp === 'function' && WanderPlanNative.isNativeApp()); }
  catch { return false; }
}
function nativeNotify(title, body) {
  try { if (window.WanderPlanNative && typeof WanderPlanNative.notify === 'function') WanderPlanNative.notify(title, body); } catch {}
}

let maneuvers = [];   // [{ at: MeterAbStart, dir: 'links'|'rechts' }]
let routeCum = [];    // kumulierte Distanz je Stützpunkt
let lastTurnKey = null;

// Abzweigungen aus der Routen-Geometrie ableiten (grobe, aber nützliche Hinweise).
function buildManeuvers(coords) {
  maneuvers = [];
  routeCum = [0];
  if (!coords || coords.length < 2) return;
  for (let i = 1; i < coords.length; i++) {
    routeCum[i] = routeCum[i - 1] + haversine(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1]);
  }
  for (let i = 1; i < coords.length - 1; i++) {
    const b1 = bearing(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1]);
    const b2 = bearing(coords[i][0], coords[i][1], coords[i + 1][0], coords[i + 1][1]);
    const d = ((b2 - b1 + 540) % 360) - 180;
    if (Math.abs(d) >= 35) {
      if (!maneuvers.length || routeCum[i] - maneuvers[maneuvers.length - 1].at > 25) {
        maneuvers.push({ at: routeCum[i], dir: d > 0 ? 'rechts' : 'links' });
      }
    }
  }
}

function updateTurnByTurn() {
  if (!navMode || !isInstalledApp() || !currentRoute || !currentRoute.coords || !lastPosition || routeCum.length < 2) {
    hideTurn();
    return;
  }
  const coords = currentRoute.coords;
  const la = lastPosition.coords.latitude, lo = lastPosition.coords.longitude;
  let best = 0, bestD = Infinity;
  for (let i = 0; i < coords.length; i++) {
    const d = haversine(la, lo, coords[i][0], coords[i][1]);
    if (d < bestD) { bestD = d; best = i; }
  }
  const along = routeCum[best];
  const endDist = routeCum[routeCum.length - 1] - along;
  const next = maneuvers.find((m) => m.at > along + 3);
  let icon, title, body;
  if (endDist < 30) { icon = '🏁'; title = 'Ziel erreicht'; body = 'Du bist am Ziel angekommen.'; }
  else if (next) {
    const dd = Math.max(0, Math.round(next.at - along));
    icon = next.dir === 'rechts' ? '➡️' : '⬅️';
    title = `In ${fmtDistance(dd)} ${next.dir}`;
    body = `Dann weiter Richtung Ziel (noch ${fmtDistance(endDist)}).`;
  } else { icon = '⬆️'; title = 'Geradeaus'; body = `Noch ${fmtDistance(endDist)} bis zum Ziel.`; }
  showTurn(icon, title, body);
  // Ansage (Benachrichtigung) nur bei Wechsel, damit es nicht spammt.
  if (title !== lastTurnKey) { lastTurnKey = title; turnNotify(title, body); }
}

function showTurn(icon, title, sub) {
  const el = $('navTurn');
  if (!el) return;
  $('navTurnIcon').textContent = icon;
  $('navTurnText').textContent = title;
  $('navTurnSub').textContent = sub;
  el.classList.remove('hidden');
}
function hideTurn() { const el = $('navTurn'); if (el) el.classList.add('hidden'); lastTurnKey = null; }

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
  renderQR('shareQr', shareLink);
  $('shareIdle').classList.add('hidden');
  $('shareActive').classList.remove('hidden');
  $('actShare').classList.add('active');
  if (!sensors.gpsRunning()) {
    sensors.startGPS();
    setLocateButton();
  }
  setShareStatus('waiting');
  nativeStartShare('solo', share.getShareToken());
  maybeShareRoute(); // vorhandene Route sofort mitsenden, wenn Schalter an
  showToast('Teilen gestartet. Schick den Link an deine Begleiter.', { duration: 5000 });
});

$('btnShareStop').addEventListener('click', () => {
  share.stopSharing();
  nativeStopShare();
  $('shareActive').classList.add('hidden');
  $('shareIdle').classList.remove('hidden');
  $('actShare').classList.remove('active');
  showToast('Teilen beendet.');
});

// ---------- Brücke zur nativen Android-App (Hintergrund-Standort) ----------
// Im Browser ist WanderPlanNative undefined → No-op. In der App übernimmt der
// native Vordergrund-Dienst zusätzlich das Publizieren – auch im Hintergrund.
function nativeStartShare(mode, token, extra = {}) {
  try {
    if (window.WanderPlanNative && typeof WanderPlanNative.startShare === 'function') {
      WanderPlanNative.startShare(JSON.stringify({ mode, token, name: getOwnName(), ...extra }));
    }
  } catch { /* ignore */ }
}
function nativeStopShare() {
  try {
    if (window.WanderPlanNative && typeof WanderPlanNative.stopShare === 'function') {
      WanderPlanNative.stopShare();
    }
  } catch { /* ignore */ }
}

$('btnShareCopy').addEventListener('click', () => copyLink(shareLink));
$('btnShareNative').addEventListener('click', async () => {
  const data = { title: 'WanderPlan – mein Live-Standort', text: 'Verfolge meine Wanderung live:', url: shareLink };
  if (navigator.share) {
    try { await navigator.share(data); } catch { /* abgebrochen */ }
  } else {
    copyLink(shareLink);
  }
});

async function copyLink(link, inputSel = '#shareLink') {
  try {
    await navigator.clipboard.writeText(link);
    showToast('Link kopiert.');
  } catch {
    const inp = document.querySelector(inputSel);
    if (inp) { inp.focus(); inp.select(); }
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
  $('btnTarget').classList.remove('hidden');

  share.startViewing(token, { onMessage: onSharedMessage, onStatus: onViewerStatus, onRoute: onSharedRoute });

  $('btnCenterShared').addEventListener('click', () => {
    if (sharedData) {
      followShared = true;
      mapView.panTo(sharedData.lat, sharedData.lon, Math.max(mapView.getZoom(), 15));
    }
  });

  autoLocate(); // eigener blauer Punkt
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
    mapView.panTo(data.lat, data.lon, Math.max(mapView.getZoom(), 15));
  }
  $('vwSpeed').textContent = fmtSpeed(data.speed);
  $('vwAltitude').textContent = fmtEle(data.alt);
  updateViewerDerived();
  updateConnector();
  checkArrival('shared', data.name || 'Wanderer', data.lat, data.lon);
}

// Der Sender teilt (optional) seine geplante Route mit.
// Deduplizieren, damit wiederholte (retained) Nachrichten nicht spammen.
let lastSharedRouteKey = null;
function onSharedRoute(coords) {
  if (coords && coords.length >= 2) {
    const key = `${coords.length}:${coords[0].join(',')}:${coords[coords.length - 1].join(',')}`;
    if (key === lastSharedRouteKey) return; // unverändert → nichts tun
    const firstTime = lastSharedRouteKey === null;
    lastSharedRouteKey = key;
    mapView.drawRoute(coords, {});
    if (!sharedData) mapView.fitToCoords(coords);
    if (firstTime) showToast('🗺 Der Sender teilt seine geplante Route.', { duration: 4000 });
  } else {
    if (lastSharedRouteKey === null) return;
    lastSharedRouteKey = null;
    mapView.clearRouteLine();
  }
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

// ---------- Werkzeug-Menü (bündelt 3D / Navi / Orte) ----------

$('btnTools').addEventListener('click', (e) => {
  e.stopPropagation();
  const open = $('toolCluster').classList.toggle('open');
  $('btnTools').classList.toggle('active', open);
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('.map-fabs')) {
    $('toolCluster').classList.remove('open');
    $('btnTools').classList.remove('active');
  }
});

// ---------- 2D/3D-Umschalter ----------

function syncBtn3d() {
  const on = mapView.is3D();
  $('btn3d').classList.toggle('active', on);
  $('btn3d').textContent = on ? '🏔' : '🗺';
}

$('btn3d').addEventListener('click', () => {
  mapView.toggle3D();
  syncBtn3d();
  showToast(mapView.is3D() ? '3D-Geländeansicht' : '2D-Ansicht');
});

// ---------- 🔊 Sprach-Navigation umschalten ----------
// Gespeicherten Zustand am Knopf spiegeln (voiceOn selbst wird weiter unten,
// bei den Turn-by-Turn-Helfern, initialisiert – hier direkt aus dem Speicher).
try { if (localStorage.getItem('wanderplan.voice') === '1') $('btnVoice').classList.add('active'); } catch { /* egal */ }
$('btnVoice').addEventListener('click', () => {
  const on = !voiceOn;
  setVoice(on);
  if (on) {
    // Direkt aus der Nutzer-Aktion sprechen – schaltet die Stimme auf iOS frei.
    speakNav('Sprach-Navigation aktiviert.');
    showToast(t('toast.voiceOn'));
  } else {
    showToast(t('toast.voiceOff'));
  }
});

// ---------- 🗺 Kartenstil umschalten (Standard / Topo / Satellit) ----------
const STYLE_ICON = { standard: '🗺', topo: '🗻', satellite: '🛰' };
function syncMapStyleBtn() {
  const base = mapView.getBaseStyle();
  const b = $('btnMapStyle');
  if (!b) return;
  b.textContent = STYLE_ICON[base] || '🗺';
  b.classList.toggle('active', base !== 'standard');
}
$('btnMapStyle').addEventListener('click', () => {
  const base = mapView.cycleBaseStyle();
  syncMapStyleBtn();
  showToast(t('toast.style', { name: mapView.getBaseLabel(base) }));
});
syncMapStyleBtn();

// ---------- 🆘 SOS / Notfall ----------
function fmtLatLon(lat, lon) { return `${lat.toFixed(5)}, ${lon.toFixed(5)}`; }

function fillSos(lat, lon) {
  $('sosCoords').textContent = fmtLatLon(lat, lon);
  $('sosMeta').textContent = 'Höhe & Ort werden ermittelt …';
  Promise.allSettled([reverseGeocode(lat, lon), fetchElevations([[lat, lon]])]).then(([place, ele]) => {
    // Nur übernehmen, wenn die Karte noch denselben Punkt zeigt.
    if ($('sosCoords').textContent !== fmtLatLon(lat, lon)) return;
    let meta = '';
    if (ele.status === 'fulfilled' && Array.isArray(ele.value) && ele.value[0] != null) meta += `⛰ ${Math.round(ele.value[0])} m`;
    if (place.status === 'fulfilled' && place.value && place.value.short) meta += (meta ? ' · ' : '') + place.value.short;
    $('sosMeta').textContent = meta || 'Standort ermittelt.';
  });
}

function openSos() {
  $('pinCard').classList.add('hidden');
  $('sosCard').classList.remove('hidden');
  if (lastPosition) {
    fillSos(lastPosition.coords.latitude, lastPosition.coords.longitude);
  } else {
    $('sosCoords').textContent = 'Standort wird gesucht …';
    $('sosMeta').textContent = '';
    whenLocated(() => fillSos(lastPosition.coords.latitude, lastPosition.coords.longitude));
  }
}

function sosPayload() {
  if (!lastPosition) return null;
  const { latitude, longitude } = lastPosition.coords;
  const gmaps = `https://www.google.com/maps?q=${latitude},${longitude}`;
  return { latitude, longitude, gmaps, text: `🆘 Notfall – mein Standort: ${fmtLatLon(latitude, longitude)}\n${gmaps}` };
}

$('btnSos').addEventListener('click', openSos);
$('sosClose').addEventListener('click', () => $('sosCard').classList.add('hidden'));
$('sosShare').addEventListener('click', async () => {
  const p = sosPayload();
  if (!p) { showToast(t('toast.sosNoPos'), { error: true }); return; }
  if (navigator.share) {
    try { await navigator.share({ title: 'Notfall – mein Standort', text: p.text, url: p.gmaps }); return; } catch { /* abgebrochen */ }
  }
  try { await navigator.clipboard.writeText(p.text); showToast(t('toast.sosShared')); }
  catch { window.prompt('Standort kopieren:', p.text); }
});
$('sosCopy').addEventListener('click', async () => {
  const p = sosPayload();
  if (!p) { showToast(t('toast.sosNoPos'), { error: true }); return; }
  try { await navigator.clipboard.writeText(`${fmtLatLon(p.latitude, p.longitude)} · ${p.gmaps}`); showToast(t('toast.coordsCopied')); }
  catch { window.prompt('Koordinaten kopieren:', fmtLatLon(p.latitude, p.longitude)); }
});

// ---------- QR-Code ----------

function renderQR(elId, text) {
  const el = $(elId);
  el.innerHTML = '';
  if (typeof qrcode === 'undefined') return;
  try {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    el.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  } catch { /* QR optional */ }
}

// ---------- Gruppe: mehrere Wanderer ----------

const peers = new Map();       // pid -> { name, color, ts }
const lastPeerPos = new Map(); // pid -> { lat, lon }
let groupLink = '';
let groupPeerTimer = null;

function updateGroupSendBtn(sending) {
  const btn = $('btnGroupSendToggle');
  btn.classList.toggle('btn-primary', sending);
  btn.textContent = sending ? '📍 Senden aktiv – tippen zum Stoppen' : '📍 Meinen Standort senden';
}

function setGroupStatus(state, text) {
  const el = $('groupStatus');
  const m = {
    connecting: ['status share-status', '⏳ Verbinde mit Server …'],
    live: ['status share-status ok', '🟢 Mit Gruppe verbunden'],
    reconnecting: ['status share-status warn', '🔄 Verbindung verloren – neuer Versuch …'],
    error: ['status share-status err', '⚠ ' + (text || 'Fehler')],
  };
  if (state === 'stopped') return;
  const [cls, def] = m[state] || ['status share-status', text || ''];
  el.className = cls;
  el.textContent = def;
}

function enterGroupUI(link, sending) {
  groupLink = link;
  switchToTab('share');
  ensureExpanded();
  $('shareIdle').classList.add('hidden');
  $('shareActive').classList.add('hidden');
  $('groupActive').classList.remove('hidden');
  $('groupLink').value = link;
  renderQR('groupQr', link);
  $('actShare').classList.add('active');
  $('btnCenterShared').classList.remove('hidden');
  $('btnTarget').classList.remove('hidden');
  updateGroupSendBtn(sending);
  if (sending && !sensors.gpsRunning()) { sensors.startGPS(); setLocateButton(); }
  else autoLocate(); // eigener blauer Punkt auch beim Zuschauen
  if (!groupPeerTimer) groupPeerTimer = setInterval(prunePeers, 5000);
}

function onPeer(data) {
  if (data.isSelf) return;
  peers.set(data.pid, { name: data.name || 'Wanderer', color: data.color || '#8e24aa', ts: Date.now() });
  lastPeerPos.set(data.pid, { lat: data.lat, lon: data.lon });
  mapView.updatePeer(data.pid, { lat: data.lat, lng: data.lon, color: data.color, name: data.name });
  renderPeerList();
  updateConnector();
  checkArrival(data.pid, data.name || 'Wanderer', data.lat, data.lon);
}

function onPeerLeft(pid) {
  peers.delete(pid);
  lastPeerPos.delete(pid);
  mapView.removePeer(pid);
  renderPeerList();
}

function prunePeers() {
  const now = Date.now();
  for (const [pid, p] of peers) {
    if (now - p.ts > 60000) { peers.delete(pid); lastPeerPos.delete(pid); mapView.removePeer(pid); }
  }
  renderPeerList();
}

function renderPeerList() {
  const ul = $('peerList');
  ul.innerHTML = '';
  if (peers.size === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'Noch niemand sonst sichtbar – teile den Link!';
    ul.appendChild(li);
    return;
  }
  for (const [, p] of peers) {
    const li = document.createElement('li');
    li.className = 'item';
    const dot = document.createElement('span');
    dot.className = 'peer-swatch';
    dot.style.background = p.color;
    const info = document.createElement('div');
    info.className = 'item-info';
    const ago = Math.round((Date.now() - p.ts) / 1000);
    info.innerHTML = `<div class="item-name"></div><div class="item-meta">aktiv vor ${ago} s</div>`;
    info.querySelector('.item-name').textContent = p.name;
    li.append(dot, info);
    ul.appendChild(li);
  }
}

$('btnGroupStart').addEventListener('click', () => {
  if (!window.isSecureContext) { showToast('Teilen braucht HTTPS.', { error: true }); return; }
  const link = share.startGroup({ name: $('shareName').value.trim(), share: true, onStatus: setGroupStatus, onPeer, onPeerLeft });
  enterGroupUI(link, true);
  const info = share.getGroupInfo();
  nativeStartShare('group', info.token, { pid: info.pid });
  showToast('Gruppe gestartet. Schick den Link an deine Begleiter.', { duration: 5000 });
});

$('btnGroupSendToggle').addEventListener('click', () => {
  const nowSending = !share.getGroupInfo().sharing;
  share.setGroupSharing(nowSending);
  updateGroupSendBtn(nowSending);
  const info = share.getGroupInfo();
  if (nowSending) nativeStartShare('group', info.token, { pid: info.pid });
  else nativeStopShare();
  showToast(nowSending ? 'Dein Standort wird jetzt mitgeteilt.' : 'Standort-Senden gestoppt.');
  if (nowSending && !sensors.gpsRunning()) { sensors.startGPS(); setLocateButton(); }
});

$('btnGroupLeave').addEventListener('click', () => {
  share.stopGroup();
  nativeStopShare();
  mapView.clearPeers();
  peers.clear();
  lastPeerPos.clear();
  clearInterval(groupPeerTimer); groupPeerTimer = null;
  $('groupActive').classList.add('hidden');
  $('shareIdle').classList.remove('hidden');
  $('actShare').classList.remove('active');
  showToast('Gruppe verlassen.');
});

$('btnGroupCopy').addEventListener('click', () => copyLink(groupLink, '#groupLink'));
$('btnGroupShareNative').addEventListener('click', async () => {
  const d = { title: 'WanderPlan – Gruppen-Wanderung', text: 'Wandert mit oder verfolgt uns live:', url: groupLink };
  if (navigator.share) { try { await navigator.share(d); } catch { /* abgebrochen */ } }
  else copyLink(groupLink, '#groupLink');
});

// ---------- Ziel & Ankunfts-Benachrichtigung ----------

let targetPoint = null; // { lat, lon, radius }
const TARGET_RADIUS = 150;
const arrived = new Set();

$('btnTarget').addEventListener('click', async () => {
  if (targetPoint) { clearTarget(); return; }
  if ('Notification' in window && Notification.permission === 'default') {
    try { await Notification.requestPermission(); } catch {}
  }
  showToast('Tippe auf die Karte, um das Ziel zu setzen.', { duration: 5000 });
  mapView.setClickHandler((ll) => {
    mapView.setClickHandler(null);
    targetPoint = { lat: ll.lat, lon: ll.lng, radius: TARGET_RADIUS };
    arrived.clear();
    mapView.setTarget(ll.lat, ll.lng, TARGET_RADIUS);
    $('btnTarget').classList.add('active');
    updateTargetChip();
    startNav(ll.lat, ll.lng, 'Ziel');
    showToast('Ziel gesetzt – Navigation aktiv, Benachrichtigung bei Ankunft (150 m).', { duration: 4000 });
  });
});

function clearTarget() {
  targetPoint = null;
  arrived.clear();
  mapView.clearTarget();
  mapView.setClickHandler(null);
  $('btnTarget').classList.remove('active');
  $('targetChip').classList.add('hidden');
}

$('targetChip').addEventListener('click', clearTarget);

function updateTargetChip() {
  const chip = $('targetChip');
  if (!targetPoint) { chip.classList.add('hidden'); return; }
  let best = null;
  const consider = (name, lat, lon) => {
    const d = haversine(lat, lon, targetPoint.lat, targetPoint.lon);
    if (!best || d < best.d) best = { d, name };
  };
  if (sharedData) consider(sharedData.name || 'Wanderer', sharedData.lat, sharedData.lon);
  for (const [pid, p] of peers) { const m = lastPeerPos.get(pid); if (m) consider(p.name, m.lat, m.lon); }
  if (!best && lastPosition) consider('Du', lastPosition.coords.latitude, lastPosition.coords.longitude);
  chip.textContent = best ? `🎯 ${best.name}: ${fmtDistance(best.d)}  ✕` : '🎯 Ziel gesetzt  ✕';
  chip.classList.remove('hidden');
}

function checkArrival(id, name, lat, lon) {
  if (!targetPoint) return;
  const d = haversine(lat, lon, targetPoint.lat, targetPoint.lon);
  if (d <= targetPoint.radius && !arrived.has(id)) {
    arrived.add(id);
    notify('🎯 Angekommen!', `${name} ist am Ziel angekommen.`);
  } else if (d > targetPoint.radius * 1.4) {
    arrived.delete(id);
  }
  updateTargetChip();
}

function notify(title, body) {
  showToast(`${title} ${body}`, { duration: 6000 });
  if (navigator.vibrate) { try { navigator.vibrate([200, 100, 200]); } catch {} }
  speakNav(`${title}. ${body}`);
  // Native Android-App: über die Brücke als echte System-Benachrichtigung.
  if (isNativeApp()) { nativeNotify(title, body); return; }
  // Web/PWA (inkl. iPhone-Homescreen ab iOS 16.4): über den Service Worker.
  showSystemNotification(title, body);
}

// System-Benachrichtigung anzeigen. Auf dem iPhone (installierte Web-App)
// funktioniert der Notification-Konstruktor NICHT – nur der Weg über den
// Service Worker (registration.showNotification). Deshalb bevorzugt darüber,
// mit Fallback auf den Konstruktor (Desktop-Browser).
function showSystemNotification(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const opts = { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'wanderplan' };
  try {
    if (navigator.serviceWorker && navigator.serviceWorker.ready) {
      navigator.serviceWorker.ready
        .then((reg) => reg.showNotification(title, opts))
        .catch(() => { try { new Notification(title, opts); } catch {} });
      return;
    }
  } catch { /* weiter zum Fallback */ }
  try { new Notification(title, opts); } catch {}
}

// Fragt die Benachrichtigungs-Freigabe an – muss aus einer Nutzer-Aktion heraus
// aufgerufen werden (Pflicht auf dem iPhone). Gibt true zurück, wenn erlaubt.
async function ensureNotifyPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try { return (await Notification.requestPermission()) === 'granted'; }
  catch { return false; }
}

// Abbiege-Ansage als System-Benachrichtigung: native App → Brücke,
// installierte Web-App (z. B. iPhone) → Service Worker.
function turnNotify(title, body) {
  speakNav(title);
  if (isNativeApp()) { nativeNotify(title, body); return; }
  if (isInstalledApp()) showSystemNotification(title, body);
}

// ---------- Sprach-Navigation (Web Speech API) ----------
// Liest Abbiegehinweise & Warnungen laut vor – offline, ohne Key. Toggle 🔊.
let voiceOn = false;
try { voiceOn = localStorage.getItem('wanderplan.voice') === '1'; } catch { /* egal */ }

function speakNav(text) {
  if (!voiceOn || !text) return;
  if (!('speechSynthesis' in window)) return;
  if (document.hidden) return; // im Hintergrund nicht plappern
  // Emojis/Symbole entfernen, damit die Stimme sie nicht vorliest.
  const clean = String(text).replace(/[\p{Extended_Pictographic}\u{FE0F}\u{20E3}]/gu, '').replace(/\s+/g, ' ').trim();
  if (!clean) return;
  try {
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = 'de-DE';
    window.speechSynthesis.cancel(); // laufende Ansage ersetzen (immer die aktuellste)
    window.speechSynthesis.speak(u);
  } catch { /* Sprachausgabe optional */ }
}

function setVoice(on) {
  voiceOn = on;
  try { localStorage.setItem('wanderplan.voice', on ? '1' : '0'); } catch { /* egal */ }
  const b = $('btnVoice');
  if (b) b.classList.toggle('active', on);
  if (!on) { try { window.speechSynthesis.cancel(); } catch {} }
}

// Center-Button: Solo → geteilte Position; Gruppe → alle Teilnehmer einpassen.
$('btnCenterShared').addEventListener('click', () => {
  if (share.inGroup() && lastPeerPos.size > 0) {
    const pts = [...lastPeerPos.values()].map((m) => [m.lat, m.lon]);
    if (lastPosition) pts.push([lastPosition.coords.latitude, lastPosition.coords.longitude]);
    if (pts.length >= 2) mapView.fitToCoords(pts);
    else mapView.panTo(pts[0][0], pts[0][1], Math.max(mapView.getZoom(), 15));
  }
});

// ---------- Theme (Hell/Dunkel) ----------

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  $('themeBtn').textContent = theme === 'dark' ? '☀️' : '🌙';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0e1411' : '#2d7d46');
  mapView.setMapTheme(theme);
}

$('themeBtn').addEventListener('click', () => {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  localStorage.setItem('wanderplan.theme', next);
  applyTheme(next);
  showToast(next === 'dark' ? '🌙 Dunkler Modus' : '☀️ Heller Modus');
});

// ---------- Sprache (DE/EN) ----------
document.documentElement.setAttribute('lang', getLang());
applyStatic();
$('langBtn').addEventListener('click', () => {
  const l = toggleLang();
  showToast(l === 'en' ? '🌐 English' : '🌐 Deutsch');
});

// ---------- Hover-Tooltips (Desktop) / Long-Press (Touch) ----------
(function initTooltips() {
  const tip = document.createElement('div');
  tip.id = 'tooltip';
  document.body.appendChild(tip);
  let hideTimer = null;
  function textFor(el) {
    const node = el.closest('[data-tip], [title], [aria-label]');
    if (!node) return null;
    return node.getAttribute('data-tip') || node.getAttribute('title') || node.getAttribute('aria-label');
  }
  function showTip(target) {
    const txt = textFor(target);
    if (!txt) return;
    tip.textContent = txt;
    const r = target.getBoundingClientRect();
    tip.style.left = Math.min(Math.max(r.left + r.width / 2, 60), window.innerWidth - 60) + 'px';
    tip.style.top = (r.bottom + 8) + 'px';
    tip.style.transform = 'translate(-50%, 0)';
    tip.classList.add('show');
    clearTimeout(hideTimer);
  }
  function hideTip() { tip.classList.remove('show'); }
  // Nur Steuer-Elemente mit Titel/Tip: Kopf-Knöpfe + Karten-FABs.
  const SEL = '.icon-btn, .fab, .compass';
  document.addEventListener('mouseover', (e) => { const el = e.target.closest(SEL); if (el) showTip(el); });
  document.addEventListener('mouseout', (e) => { if (e.target.closest(SEL)) hideTip(); });
  document.addEventListener('mousedown', hideTip, true);
  // Touch: langer Druck zeigt den Hinweis kurz.
  document.addEventListener('touchstart', (e) => {
    const el = e.target.closest(SEL);
    if (!el) return;
    hideTimer = setTimeout(() => { showTip(el); setTimeout(hideTip, 1600); }, 500);
  }, { passive: true });
  document.addEventListener('touchend', () => clearTimeout(hideTimer));
  document.addEventListener('touchmove', () => clearTimeout(hideTimer));
})();

// ---------- Karten-Fehler-Fallback ----------
let mapIsReady = false;
mapView.onReady(() => { mapIsReady = true; const me = $('mapError'); if (me) me.classList.add('hidden'); });
// Wenn die 3D-Vektorkarte klemmt, springt automatisch eine Raster-Karte ein.
mapView.onMapFallback(() => showToast(t('toast.mapFallback'), { duration: 5000 }));
$('mapErrorReload').addEventListener('click', () => window.location.reload());
// Letztes Netz: rendert nach 14 s gar nichts (auch der Raster-Fallback nicht),
// sichtbare Fehlermeldung mit Neu-laden-Knopf statt weißer Fläche.
setTimeout(() => { if (!mapIsReady) $('mapError').classList.remove('hidden'); }, 14000);

// ---------- Verbindungslinie (Luftlinie ich ↔ verfolgte Person) ----------

function updateConnector() {
  const own = mapView.getPositionLngLat();
  if (!own) { mapView.clearConnector(); return; }
  let other = null;
  if (viewerMode && sharedData) {
    other = { lat: sharedData.lat, lng: sharedData.lon };
  } else if (share.inGroup() && lastPeerPos.size) {
    let best = null;
    for (const m of lastPeerPos.values()) {
      const d = haversine(own.lat, own.lng, m.lat, m.lon);
      if (!best || d < best.d) best = { d, m };
    }
    if (best) other = { lat: best.m.lat, lng: best.m.lon };
  }
  if (other) mapView.setConnector({ lat: own.lat, lng: own.lng }, other);
  else mapView.clearConnector();
}

// ---------- Ortssuche ----------

let lastSearchPlace = null;
let searchDebounce = null;
let searchSeq = 0;

// Bezugspunkt für Nähe/Entfernung: eigener Standort, sonst Karten-Mitte.
function searchRef() {
  if (lastPosition) return { lat: lastPosition.coords.latitude, lon: lastPosition.coords.longitude };
  const c = mapView.getCenter();
  return { lat: c.lat, lon: c.lng };
}

// ---------- Letzte Suchen ----------
function getRecents() {
  try { return JSON.parse(localStorage.getItem('wanderplan.recent') || '[]'); } catch { return []; }
}
function addRecent(p) {
  const list = getRecents().filter((r) => !(Math.abs(r.lat - p.lat) < 1e-5 && Math.abs(r.lon - p.lon) < 1e-5));
  list.unshift({ short: p.short, name: p.name, lat: p.lat, lon: p.lon, kind: p.kind });
  localStorage.setItem('wanderplan.recent', JSON.stringify(list.slice(0, 6)));
}

function selectPlace(p) {
  lastSearchPlace = p;
  addRecent(p);
  mapView.flyTo(p.lat, p.lon, 14);
  $('searchResults').classList.add('hidden');
  $('searchInput').value = p.short;
  $('searchClear').classList.remove('hidden');
  startNav(p.lat, p.lon, p.short);
  showToast(`${kindEmoji(p.kind)} ${p.short} – Navigation aktiv. „Route zum Ziel" plant dorthin.`, { duration: 4500 });
}

function renderResults(places, { recent = false } = {}) {
  const ul = $('searchResults');
  const ref = searchRef();
  ul.innerHTML = '';
  if (recent && places.length) {
    const h = document.createElement('li'); h.className = 'sr-head'; h.textContent = 'Zuletzt gesucht'; ul.appendChild(h);
  }
  for (const p of places) {
    const li = document.createElement('li');
    li.className = 'sr-item';
    const ic = document.createElement('span'); ic.className = 'sr-ic'; ic.textContent = kindEmoji(p.kind);
    const txt = document.createElement('div'); txt.className = 'sr-txt';
    const n = document.createElement('div'); n.className = 'sr-name'; n.textContent = p.short;
    const s = document.createElement('div'); s.className = 'sr-sub'; s.textContent = p.name;
    txt.append(n, s);
    const dist = document.createElement('span'); dist.className = 'sr-dist';
    dist.textContent = fmtDistance(haversine(ref.lat, ref.lon, p.lat, p.lon));
    li.append(ic, txt, dist);
    li.addEventListener('click', () => selectPlace(p));
    ul.appendChild(li);
  }
  ul.classList.toggle('hidden', places.length === 0);
}

async function doSearch() {
  const q = $('searchInput').value.trim();
  const ul = $('searchResults');
  if (!q) { showRecents(); return; }
  const seq = ++searchSeq;
  ul.innerHTML = '<li class="empty">Suche …</li>';
  ul.classList.remove('hidden');
  try {
    const ref = searchRef();
    const places = await searchPlaces(q, { lat: ref.lat, lon: ref.lon });
    if (seq !== searchSeq) return; // veraltete Antwort verwerfen
    if (!places.length) { ul.innerHTML = '<li class="empty">Nichts gefunden.</li>'; return; }
    renderResults(places);
  } catch {
    if (seq === searchSeq) ul.innerHTML = '<li class="empty">Suche gerade nicht möglich.</li>';
  }
}

function showRecents() {
  const recents = getRecents();
  if (!recents.length) { $('searchResults').classList.add('hidden'); return; }
  renderResults(recents, { recent: true });
}

$('searchBtn').addEventListener('click', doSearch);
$('searchInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); clearTimeout(searchDebounce); doSearch(); } });
$('searchInput').addEventListener('input', () => {
  const v = $('searchInput').value.trim();
  $('searchClear').classList.toggle('hidden', !v);
  clearTimeout(searchDebounce);
  if (v.length < 2) { showRecents(); return; }
  searchDebounce = setTimeout(doSearch, 350); // Live-Vorschläge, entprellt
});
$('searchInput').addEventListener('focus', () => {
  if (!$('searchInput').value.trim()) showRecents();
});
$('searchClear').addEventListener('click', () => {
  $('searchInput').value = '';
  $('searchClear').classList.add('hidden');
  $('searchResults').classList.add('hidden');
  lastSearchPlace = null;
  $('searchInput').focus();
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-wrap')) $('searchResults').classList.add('hidden');
});

// ---------- Interessante Orte (POI) in der Nähe ----------

let poiActive = false;

$('btnPoi').addEventListener('click', async () => {
  if (poiActive) {
    poiActive = false;
    mapView.clearPois();
    $('btnPoi').classList.remove('active');
    return;
  }
  const c = mapView.getCenter();
  $('btnPoi').classList.add('busy');
  try {
    const list = await fetchPois(c.lat, c.lng, { radiusM: 4000, limit: 40 });
    if (!list.length) { showToast('Keine besonderen Orte in der Nähe gefunden.'); return; }
    mapView.setPois(list);
    poiActive = true;
    $('btnPoi').classList.add('active');
    showToast(`📌 ${list.length} Orte in der Nähe – antippen für Navigation dorthin.`, { duration: 4000 });
  } catch {
    showToast('Orte gerade nicht abrufbar. Bist du online?', { error: true });
  } finally {
    $('btnPoi').classList.remove('busy');
  }
});

mapView.onPoiClick((p) => {
  // Info-Karte zeigen mit „Route hierher" (echte Wanderroute) / „Als Ziel".
  pinPoint = { lat: p.lat, lon: p.lon, name: p.name };
  lastSearchPlace = { short: p.name, name: p.name, lat: p.lat, lon: p.lon };
  $('pinName').textContent = `${p.emoji} ${p.name}`;
  $('pinMeta').textContent = (p.ele != null ? `⛰ ${p.ele} m · ` : '')
    + `${fmtDistance(p.dist)} entfernt · ${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`;
  $('pinCard').classList.remove('hidden');
  mapView.flyTo(p.lat, p.lon, Math.max(mapView.getZoom(), 14));
});

// ---------- Ziel-Navigation (Pfeil + Entfernung/ETA) ----------

let navTarget = null; // { lat, lon, name }

function bearingTo(lat1, lon1, lat2, lon2) {
  const toRad = Math.PI / 180, toDeg = 180 / Math.PI;
  const dLon = (lon2 - lon1) * toRad;
  const y = Math.sin(dLon) * Math.cos(lat2 * toRad);
  const x = Math.cos(lat1 * toRad) * Math.sin(lat2 * toRad)
    - Math.sin(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.cos(dLon);
  return (Math.atan2(y, x) * toDeg + 360) % 360;
}

function startNav(lat, lon, name) {
  navTarget = { lat, lon, name: name || 'Ziel' };
  $('navPanel').classList.remove('hidden');
  updateNav();
}

function stopNav() {
  navTarget = null;
  $('navPanel').classList.add('hidden');
}

$('navClose').addEventListener('click', stopNav);

function fmtEta(distanceM, speedMs) {
  const v = speedMs && speedMs > 0.5 ? speedMs : 1.1; // sonst ~4 km/h annehmen
  const secs = distanceM / v;
  if (secs < 60) return '< 1 min';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return `${h} h ${m} min`;
}

function updateNav() {
  if (!navTarget) return;
  if (!lastPosition) {
    $('navDist').textContent = '–';
    $('navEta').textContent = `nach ${navTarget.name} · orte dich`;
    return;
  }
  const { latitude, longitude, speed } = lastPosition.coords;
  const dist = haversine(latitude, longitude, navTarget.lat, navTarget.lon);
  const brng = bearingTo(latitude, longitude, navTarget.lat, navTarget.lon);
  const rot = brng - (lastHeading != null ? lastHeading : 0);
  $('navArrow').style.transform = `rotate(${rot}deg)`;
  $('navDist').textContent = fmtDistance(dist);
  $('navEta').textContent = `${navTarget.name} · ${fmtEta(dist, speed)}`;
}

// ---------- Steigungs-Einfärbung umschalten ----------

$('btnSlope').addEventListener('click', () => {
  const on = !mapView.isRouteGradeVisible();
  mapView.setRouteGradeVisible(on);
  $('btnSlope').classList.toggle('active', on);
  showToast(on ? '🎨 Steigung farbig: grün = flach, rot = steil.' : 'Steigungs-Farben aus.');
});

// ---------- Routen-Flyover (animierte 3D-Kamerafahrt) ----------

function stopFlyover() {
  mapView.stopFlyover();
  mapView.hideHighlight();
  $('btnFlyover').classList.remove('active');
  $('btnFlyover').textContent = '🎬 Flyover';
}

$('btnFlyover').addEventListener('click', () => {
  if (mapView.isFlyover()) { stopFlyover(); return; }
  if (!currentRoute || !currentRoute.coords || currentRoute.coords.length < 2) {
    showToast('Erst eine Route planen, dann abfliegen.', { duration: 3500 });
    return;
  }
  follow = false;
  $('btnFlyover').classList.add('active');
  $('btnFlyover').textContent = '⏹ Stopp';
  mapView.flyover(currentRoute.coords, {
    onStep: (t, ll) => mapView.showHighlight(ll[0], ll[1]),
    onDone: () => { stopFlyover(); mapView.fitToCoords(currentRoute.coords.map((c) => [c[0], c[1]])); },
  });
});

// ---------- App-Download-Menü (📱 → Android / iOS) ----------

$('appDownloadBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  $('appMenu').classList.toggle('hidden');
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('.app-menu-wrap')) $('appMenu').classList.add('hidden');
});
// Läuft WanderPlan als installierte App (Android-Wrapper, PWA im Vollbild oder
// iOS-Webclip)? Dann ist der Download überflüssig → Menü ausblenden.
function isInstalledApp() {
  try {
    if (isNativeApp()) return true;
    if (window.navigator.standalone === true) return true; // iOS-Webclip
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
    if (window.matchMedia && window.matchMedia('(display-mode: fullscreen)').matches) return true;
    return document.referrer.startsWith('android-app://');
  } catch { return false; }
}

if (isInstalledApp()) {
  document.body.classList.add('installed-app');
  const w = document.querySelector('.app-menu-wrap');
  if (w) w.style.display = 'none';
}

// In der installierten App das Standort-Teilen sofort einsatzbereit machen.
// Die Standort-Freigabe wird durch die automatische Ortung ohnehin angefragt;
// hier nur ein einmaliger Hinweis, wo das Teilen sitzt. Kein automatisches
// Senden – das startet man bewusst per Knopf (Datenschutz).
function primeInstalledApp() {
  if (!isInstalledApp()) return;
  if (localStorage.getItem('wanderplan.installedHint')) return;
  localStorage.setItem('wanderplan.installedHint', '1');
  setTimeout(() => {
    showToast('✅ App bereit – unten „📡 Teilen" sendet deinen Live-Standort an Freunde.', { duration: 6500 });
  }, 2000);
}

// ---------- Karten-Langdruck: Ort, Höhe & Koordinaten ----------

let pinPoint = null;

mapView.onLongPress(async (ll) => {
  pinPoint = { lat: ll.lat, lon: ll.lng };
  $('pinName').textContent = 'Wird geladen …';
  $('pinMeta').textContent = `${ll.lat.toFixed(5)}, ${ll.lng.toFixed(5)}`;
  $('pinCard').classList.remove('hidden');
  const [place, ele] = await Promise.allSettled([
    reverseGeocode(ll.lat, ll.lng),
    fetchElevations([[ll.lat, ll.lng]]),
  ]);
  if (!pinPoint || pinPoint.lat !== ll.lat || pinPoint.lon !== ll.lng) return; // anderer Punkt inzwischen
  $('pinName').textContent = (place.status === 'fulfilled' && place.value && place.value.short) ? place.value.short : 'Unbenannter Ort';
  let meta = `${ll.lat.toFixed(5)}, ${ll.lng.toFixed(5)}`;
  if (ele.status === 'fulfilled' && Array.isArray(ele.value) && ele.value[0] != null) meta = `⛰ ${Math.round(ele.value[0])} m · ${meta}`;
  $('pinMeta').textContent = meta;
});

$('pinClose').addEventListener('click', () => { $('pinCard').classList.add('hidden'); pinPoint = null; });
$('pinRoute').addEventListener('click', () => {
  if (!pinPoint) return;
  autoRouteTo(pinPoint.lat, pinPoint.lon);
  $('pinCard').classList.add('hidden');
});
$('pinTarget').addEventListener('click', () => {
  if (!pinPoint) return;
  targetPoint = { lat: pinPoint.lat, lon: pinPoint.lon, radius: TARGET_RADIUS };
  arrived.clear();
  mapView.setTarget(pinPoint.lat, pinPoint.lon, TARGET_RADIUS);
  $('btnTarget').classList.add('active');
  updateTargetChip();
  startNav(pinPoint.lat, pinPoint.lon, $('pinName').textContent || 'Ziel');
  $('pinCard').classList.add('hidden');
  showToast('🎯 Ziel gesetzt – Navigation aktiv.');
});

// ---------- Wetter & Sonnenuntergang ----------

let lastWeatherFetch = { time: 0, lat: null, lon: null };
let sunsetWarned = false;

async function updateWeather(lat, lon, force = false) {
  const now = Date.now();
  const near = lastWeatherFetch.lat != null && haversine(lat, lon, lastWeatherFetch.lat, lastWeatherFetch.lon) < 4000;
  if (!force && now - lastWeatherFetch.time < 300000 && near) return;
  lastWeatherFetch = { time: now, lat, lon };
  try {
    const w = await fetchWeather(lat, lon);
    renderWeather(w);
  } catch { /* still */ }
}

function renderWeather(w) {
  const chip = $('weatherChip');
  const info = weatherInfo(w.code);
  let txt = `${info.icon} ${w.temp != null ? Math.round(w.temp) + '°' : ''}`;
  if (w.sunset) {
    const mins = (new Date(w.sunset).getTime() - Date.now()) / 60000;
    if (mins > 0) {
      const total = Math.round(mins);
      const h = Math.floor(total / 60);
      const m = total % 60;
      txt += `  🌇 ${h > 0 ? h + ' h ' : ''}${m} min`;
      if (mins < 60 && !sunsetWarned) {
        sunsetWarned = true;
        notify('🌇 Bald Dämmerung', `Sonnenuntergang in ${Math.round(mins)} min – Zeit für den Rückweg.`);
      }
    } else {
      txt += '  🌙 nach Sonnenuntergang';
    }
  }
  chip.textContent = txt;
  chip.classList.remove('hidden');
}

$('weatherChip').addEventListener('click', () => {
  const c = mapView.getCenter();
  updateWeather(c.lat, c.lng, true);
  showToast('Wetter aktualisiert.');
});

// ---------- Zurück zum Start ----------

function getRouteStart() {
  const wps = mapView.getWaypoints();
  if (wps.length) return wps[0];
  const pts = tracking.getPoints();
  if (pts.length) return { lat: pts[0].lat, lng: pts[0].lon };
  return null;
}

function updateBackChip() {
  const chip = $('backChip');
  const start = getRouteStart();
  if (!start || !lastPosition) { chip.classList.add('hidden'); return; }
  const { latitude, longitude } = lastPosition.coords;
  const d = haversine(latitude, longitude, start.lat, start.lng);
  if (d < 25) { chip.classList.add('hidden'); return; }
  const b = bearing(latitude, longitude, start.lat, start.lng);
  chip.textContent = `↩ Start ${fmtDistance(d)} ${cardinal(b)}`;
  chip.classList.remove('hidden');
}

$('backChip').addEventListener('click', () => {
  const start = getRouteStart();
  if (start) mapView.panTo(start.lat, start.lng, Math.max(mapView.getZoom(), 14));
});

// ---------- Automatischer Routenplaner ----------

function autoRouteTo(lat, lng) {
  // Immer vom echten Standort starten (nicht von der Karten-Mitte → sonst
  // entstehen unsinnige Routen). Notfalls Ortung anstoßen und danach planen.
  whenLocated(() => {
    const start = { lat: lastPosition.coords.latitude, lng: lastPosition.coords.longitude };
    wpNames = ['Mein Standort', 'Ziel'];
    mapView.setWaypoints([start, { lat, lng }]);
    switchToTab('route');
    ensureExpanded();
    mapView.fitToCoords([[start.lat, start.lng], [lat, lng]]);
    showToast('Route von deinem Standort zum Ziel wird geplant …');
  });
}

$('btnAutoTarget').addEventListener('click', () => {
  if (lastSearchPlace) { autoRouteTo(lastSearchPlace.lat, lastSearchPlace.lon); return; }
  showToast('Tippe auf die Karte, um das Ziel zu wählen (oder oben einen Ort suchen).', { duration: 5000 });
  mapView.setClickHandler((ll) => { mapView.setClickHandler(null); autoRouteTo(ll.lat, ll.lng); });
});

$('btnAutoLoop').addEventListener('click', () => generateLoop());

// Erzeugt garantiert eine geschlossene Rundtour über echte Wege: Es werden
// mehrere Ring-Varianten probiert, bis BRouter eine echte Wanderroute liefert
// (keine Luftlinie); die Route wird am Ende exakt zum Start geschlossen und die
// Wegpunkte auf den Weg gezogen.
let loopBusy = false;
async function generateLoop() {
  if (loopBusy) return;
  loopBusy = true;
  const km = parseFloat($('loopKm').value) || 10;
  const c = lastPosition
    ? { lat: lastPosition.coords.latitude, lng: lastPosition.coords.longitude }
    : mapView.getCenter();
  switchToTab('route');
  ensureExpanded();
  setRouteStatus('Rundtour über Wege wird gesucht …');
  showToast(`Rundtour ~${km} km wird gesucht …`, { duration: 3000 });
  const profile = $('profileSelect').value;
  const reqId = ++routeRequestId;
  let best = null;
  try {
    for (let attempt = 0; attempt < 4; attempt++) {
      const pts = makeLoop(c.lat, c.lng, km, attempt);
      const result = await calculateRoute(pts, profile);
      if (reqId !== routeRequestId) { loopBusy = false; return; } // inzwischen etwas anderes
      if (result && !result.fallback && isLoopClosed(result.coords)) { best = { pts, result }; break; }
      if (result && !best) best = { pts, result }; // Notnagel merken
    }
  } catch { /* unten behandelt */ }
  if (reqId !== routeRequestId) { loopBusy = false; return; }
  if (best && !best.result.fallback) {
    wpNames = [];
    mapView.setWaypoints(best.pts, { silent: true });
    const coords = closeLoopCoords(best.result.coords); // 100 % geschlossene Schleife
    showRoute({ coords, stats: computeStats(coords), fallback: false, source: 'planned' });
    mapView.snapWaypointsToRoute(coords);
    renderWaypointList();
    setRouteStatus(null);
    showToast(`🔄 Rundtour ~${km} km erzeugt.`, { duration: 3500 });
  } else {
    setRouteStatus('Keine Rundtour über Wege gefunden – anderen Startpunkt oder eine andere Länge versuchen.', true);
    showToast('Keine echte Rundtour gefunden – versuch einen anderen Startpunkt oder eine andere Länge.', { error: true, duration: 5000 });
  }
  loopBusy = false;
}

// Ist die Route (fast) geschlossen? Start und Ende nah beieinander.
function isLoopClosed(coords) {
  if (!coords || coords.length < 3) return false;
  const a = coords[0]; const b = coords[coords.length - 1];
  return haversine(a[0], a[1], b[0], b[1]) < 80;
}
// Schließt die Route exakt: hängt den Startpunkt ans Ende, falls eine Lücke bleibt.
function closeLoopCoords(coords) {
  if (!coords || coords.length < 3) return coords;
  const a = coords[0]; const b = coords[coords.length - 1];
  if (haversine(a[0], a[1], b[0], b[1]) > 20) return coords.concat([[a[0], a[1], a[2] == null ? null : a[2]]]);
  return coords;
}

// Rundweg-Wegpunkte im Ring um den Start; attempt variiert Drehung/Radius, damit
// bei einem misslungenen Versuch eine andere Schleife probiert werden kann.
function makeLoop(lat, lng, km, attempt = 0) {
  const n = 6;                              // rundere Schleife
  const pathFactor = 1.35 + attempt * 0.1;  // reale Wege sind länger als das Polygon
  const perimeter = (km * 1000) / pathFactor;
  const radius = perimeter / (2 * n * Math.sin(Math.PI / n));
  const start = (attempt * 53 + Math.random() * 360) % 360;
  const pts = [{ lat, lng }];
  for (let i = 0; i < n; i++) {
    const brng = (start + i * (360 / n)) * Math.PI / 180;
    const dLat = (radius * Math.cos(brng)) / 6371000;
    const dLng = (radius * Math.sin(brng)) / (6371000 * Math.cos(lat * Math.PI / 180));
    pts.push({ lat: lat + dLat * 180 / Math.PI, lng: lng + dLng * 180 / Math.PI });
  }
  pts.push({ lat, lng });
  return pts;
}

// ---------- Fertige Wanderwege (OSM route=hiking) ----------
$('btnTrails').addEventListener('click', async () => {
  const btn = $('btnTrails');
  const ref = lastPosition
    ? { lat: lastPosition.coords.latitude, lon: lastPosition.coords.longitude }
    : (() => { const g = mapView.getCenter(); return { lat: g.lat, lon: g.lng }; })();
  btn.classList.add('busy'); btn.disabled = true;
  setRouteStatus(t('trails.searching'));
  try {
    const routes = await fetchHikingRoutes(ref.lat, ref.lon, { radiusM: 15000, limit: 12 });
    renderTrailList(routes);
    setRouteStatus(routes.length ? null : t('trails.none'), !routes.length);
  } catch {
    setRouteStatus(t('trails.err'), true);
  } finally { btn.classList.remove('busy'); btn.disabled = false; }
});

function renderTrailList(routes) {
  const ul = $('trailList');
  ul.innerHTML = '';
  if (!routes || !routes.length) { ul.classList.add('hidden'); return; }
  ul.classList.remove('hidden');
  routes.forEach((r) => {
    const li = document.createElement('li');
    li.className = 'item';
    const info = document.createElement('div'); info.className = 'item-info';
    const name = document.createElement('div'); name.className = 'item-name';
    name.textContent = (r.ref ? r.ref + ' · ' : '') + r.name;
    const meta = document.createElement('div'); meta.className = 'item-meta';
    meta.textContent = `${fmtDistance(r.length)} · ${fmtDistance(r.dist)} ${t('trails.away')}`;
    info.append(name, meta);
    const load = document.createElement('button'); load.className = 'item-btn';
    load.textContent = t('trails.load');
    load.addEventListener('click', () => loadTrail(r));
    li.append(info, load);
    ul.appendChild(li);
  });
}

function loadTrail(r) {
  mapView.clearWaypoints({ silent: true });
  wpNames = [];
  routeRequestId++; // eventuell laufende Berechnung abbrechen
  const coords = r.coords.map((c) => [c[0], c[1], null]);
  showRoute({ coords, stats: computeStats(coords), fallback: false, source: 'imported', name: r.name });
  mapView.fitToCoords(coords);
  switchToTab('route');
  ensureExpanded();
  showToast(`🥾 „${r.name}" – ${fmtDistance(r.length)}`, { duration: 4000 });
}

// Name für den eigenen Punkt merken, wenn im Teilen-Feld eingegeben.
$('shareName').addEventListener('change', () => {
  const v = $('shareName').value.trim();
  if (v) localStorage.setItem('wanderplan.name', v);
  mapView.setPositionLabel(getOwnName());
});

// ---------- Service Worker (PWA) + automatisches Update ----------
// Neue Versionen aktivieren sich automatisch (skipWaiting im SW). Sobald der neue
// Worker übernimmt, lädt die Seite EINMALIG frisch nach – so sind App und Karte
// immer aktuell und niemand bleibt auf einer alten, kaputten Fassung hängen.
if ('serviceWorker' in navigator && window.isSecureContext) {
  // Kurzer Hinweis nach erfolgtem Update (über den Reload hinweg gemerkt).
  try {
    if (sessionStorage.getItem('wp_updated')) {
      sessionStorage.removeItem('wp_updated');
      setTimeout(() => showToast(t('toast.updated')), 800);
    }
  } catch { /* egal */ }

  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Nur bei einem echten Update neu laden – nicht bei der Erst-Installation.
    if (!hadController) return;
    // LOOP-SICHER: höchstens EIN Reload pro Sitzung. Das Flag überlebt den
    // Reload (sessionStorage), anders als eine JS-Variable, die sich beim
    // Neuladen zurücksetzen würde – genau das konnte vorher eine Endlosschleife
    // aus Neuladen auslösen (App startete nie fertig → Karte lud nie).
    try {
      if (sessionStorage.getItem('wp_reloaded')) return;
      sessionStorage.setItem('wp_reloaded', '1');
      sessionStorage.setItem('wp_updated', '1');
    } catch { return; }
    window.location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then((reg) => {
      // Bleibt die App lange offen: ab und zu auf Updates prüfen.
      setInterval(() => { reg.update().catch(() => {}); }, 60 * 60 * 1000);
    }).catch(() => { /* offline-Funktion optional */ });
  });
}

// ---------- Start ----------

// Theme: gespeicherte Wahl oder Systemeinstellung
const storedTheme = localStorage.getItem('wanderplan.theme');
const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
applyTheme(storedTheme || (prefersDark ? 'dark' : 'light'));

renderSavedLists();
updateTrackButtons();
setSheet('half');

// Splash ausblenden, sobald die Karte geladen ist (Fallback nach 6 s).
function hideSplash() {
  const s = $('splash');
  if (!s || s.classList.contains('hide')) return;
  s.classList.add('hide');
  setTimeout(() => s.remove(), 600);
}
mapView.onReady(hideSplash);
setTimeout(hideSplash, 6000);

const urlParams = new URLSearchParams(location.search);
const shareToken = urlParams.get('share');
const groupToken = urlParams.get('group');
const routeParam = urlParams.get('route');

// Geteilte Route aus dem Link laden (Profil + Wegpunkte → Auto-Recalc).
if (routeParam && !shareToken) {
  const dec = decodeRoute(routeParam);
  if (dec) {
    if ($('profileSelect')) $('profileSelect').value = dec.profile;
    wpNames = [];
    mapView.onReady(() => {
      mapView.setWaypoints(dec.waypoints);
      switchToTab('route');
      ensureExpanded();
      mapView.fitToCoords(dec.waypoints.map((w) => [w.lat, w.lng]));
      showToast('🔗 Geteilte Route geladen – wird berechnet …', { duration: 4000 });
    });
  } else {
    showToast('Der Route-Link ist ungültig.', { error: true });
  }
}

if (shareToken) {
  initViewer(shareToken);
} else if (groupToken) {
  // Gruppen-Link geöffnet: beitreten (zuschauen), Senden per Opt-in.
  const link = share.startGroup({ token: groupToken, share: false, onStatus: setGroupStatus, onPeer, onPeerLeft });
  renderPeerList();
  enterGroupUI(link, false);
  showToast('Du bist der Gruppe beigetreten. „Meinen Standort senden" macht dich sichtbar.', { duration: 6000 });
} else {
  if (!window.isSecureContext) {
    showToast('Hinweis: GPS, Kompass und Teilen funktionieren nur über HTTPS oder localhost.', { duration: 6000 });
  } else if (!localStorage.getItem('wanderplan.seenHelp')) {
    localStorage.setItem('wanderplan.seenHelp', '1');
    openHelp();
  }
  autoLocate(); // eigener blauer Punkt beim Planen
  primeInstalledApp();
}
