// WanderPlan – Einstiegspunkt: verdrahtet Karte, Routing, Sensoren,
// Tracking, Höhenprofil, GPX und Speicherung mit der Oberfläche.

import * as mapView from './map.js';
import { calculateRoute, computeStats, fetchElevations, haversine } from './routing.js';
import * as sensors from './sensors.js';
import * as tracking from './tracking.js';
import { ElevationChart } from './elevation.js';
import { routeToGPX, trackToGPX, parseGPX, downloadGPX } from './gpx.js';
import * as storage from './storage.js';

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

const CARDINALS = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];
function cardinal(deg) {
  return CARDINALS[Math.round(deg / 45) % 8];
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

// ---------- Tabs & Panel ----------

document.querySelectorAll('.tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.tab-content').forEach((c) => {
      c.classList.toggle('hidden', c.id !== `tab-${btn.dataset.tab}`);
    });
  });
});

$('panelHandle').addEventListener('click', () => {
  const collapsed = $('panel').classList.toggle('collapsed');
  document.body.classList.toggle('panel-collapsed-mode', collapsed);
  setTimeout(() => mapView.map.invalidateSize(), 300);
});

// ---------- Höhenprofil ----------

const chart = new ElevationChart($('elevationChart'), {
  onHover: (lat, lon) => mapView.showHighlight(lat, lon),
  onLeave: () => mapView.hideHighlight(),
});

// ---------- Routenplanung ----------

let currentRoute = null; // { coords, stats, fallback, source, name? }
let routeRequestId = 0;
let recalcTimer = null;

function setRouteStatus(text, warn = false) {
  const el = $('routeStatus');
  if (!text) {
    el.classList.add('hidden');
    return;
  }
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
  if (reqId !== routeRequestId) return; // inzwischen neu angefordert
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

function setLocateButton() {
  $('btnLocate').classList.toggle('active', sensors.gpsRunning());
}

$('btnLocate').addEventListener('click', () => {
  if (!sensors.gpsAvailable()) {
    showToast('Dein Browser unterstützt keine Standortabfrage.', { error: true });
    return;
  }
  if (!sensors.gpsRunning()) {
    follow = true;
    hadFirstFix = false;
    sensors.startGPS();
    setLocateButton();
    showToast('GPS wird gestartet …');
  } else if (!follow) {
    follow = true;
    if (lastPosition) {
      mapView.map.setView([lastPosition.coords.latitude, lastPosition.coords.longitude], Math.max(mapView.map.getZoom(), 15));
    }
  } else {
    sensors.stopGPS();
    follow = false;
    mapView.removePosition();
    $('gpsChip').classList.add('hidden');
    setLocateButton();
  }
});

mapView.map.on('dragstart', () => { follow = false; });

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
});

let lastPositionTime = 0;

sensors.onGPSError((err) => {
  if (err.code === 1) {
    // Berechtigung verweigert → GPS endgültig stoppen
    sensors.stopGPS();
    setLocateButton();
    let msg = 'Standort-Zugriff verweigert. Bitte in den Browser-Einstellungen erlauben.';
    if (!window.isSecureContext) msg += ' Hinweis: GPS funktioniert nur über HTTPS oder localhost.';
    showToast(msg, { error: true });
    return;
  }
  // Vorübergehende Fehler (kein Signal, Timeout): Watch weiterlaufen lassen
  // und nur melden, wenn längere Zeit keine Position mehr ankam.
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
    // kürzesten Drehweg nehmen, damit die Rose bei 359°→0° nicht zurückschnellt
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

$('btnTrackPause').addEventListener('click', () => {
  tracking.pause();
  updateTrackButtons();
});

$('btnTrackResume').addEventListener('click', () => {
  tracking.resume();
  updateTrackButtons();
});

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
  if (tracking.getState() === 'recording' || tracking.getState() === 'paused') {
    e.preventDefault();
  }
});

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

function switchToTab(tab) {
  document.querySelector(`.tab[data-tab="${tab}"]`).click();
}

function loadSavedRoute(route) {
  switchToTab('route');
  if (route.profile) $('profileSelect').value = route.profile;
  if (route.waypoints && route.waypoints.length >= 2) {
    // Wegpunkte wiederherstellen → Route wird neu berechnet und bleibt editierbar
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
      if (confirm(`Route „${r.name}“ löschen?`)) {
        storage.deleteRoute(r.id);
        renderSavedLists();
      }
    }],
  ]);
  renderList($('trackList'), storage.listTracks(), 'Noch keine Tracks aufgezeichnet.', [
    ['Laden', 'Track auf der Karte anzeigen', '', loadSavedTrack],
    ['GPX', 'Als GPX-Datei exportieren', '', (t) => downloadGPX(t.name, trackToGPX(t.name, t.points))],
    ['🗑', 'Track löschen', 'danger', (t) => {
      if (confirm(`Track „${t.name}“ löschen?`)) {
        storage.deleteTrack(t.id);
        renderSavedLists();
      }
    }],
  ]);
}

// ---------- Start ----------

renderSavedLists();
updateTrackButtons();

if (!window.isSecureContext) {
  showToast('Hinweis: GPS und Kompass funktionieren nur über HTTPS oder localhost.', { duration: 6000 });
} else if (!localStorage.getItem('wanderplan.seenHint')) {
  localStorage.setItem('wanderplan.seenHint', '1');
  showToast('Willkommen! Tippe auf die Karte, um deine erste Route zu planen.', { duration: 6000 });
}
