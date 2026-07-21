// 3D-Karte auf Basis von MapLibre GL JS.
//
// Basis: OpenFreeMap-Vektor-Style (kostenlos, kein API-Key, inkl. 3D-Gebäuden),
// hell „liberty" / dunkel „dark". Echtes 3D-Gelände über ein Höhenmodell
// (AWS-Terrarium-DEM, keyless) + Hillshade + Himmel. Neig- und drehbar.
//
// Die öffentliche API entspricht der bisherigen Version; Koordinaten nach außen
// (lat, lng), MapLibre selbst nutzt [lng, lat].

const STYLES = {
  light: 'https://tiles.openfreemap.org/styles/liberty',
  dark: 'https://tiles.openfreemap.org/styles/dark',
};
const DEM_TILES = 'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png';

let currentTheme = 'light';
let buildings3dOn = true;

export const map = new maplibregl.Map({
  container: 'map',
  style: STYLES.light,
  center: [11.4041, 47.2692],
  zoom: 12,
  pitch: 55,
  bearing: -12,
  maxPitch: 80,
  attributionControl: { compact: true },
  cooperativeGestures: false,
  // Performance / flüssigere 3D-Ansicht
  fadeDuration: 0,
  antialias: false,
  refreshExpiredTiles: false,
  renderWorldCopies: false,
  maxTileCacheSize: 512,
  collectResourceTiming: false,
});

map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

let ready = false;
const pending = [];
function whenReady(fn) { ready ? fn() : pending.push(fn); }

// Zwischengespeicherte Overlay-Daten, damit sie einen Style-Wechsel (Dark Mode)
// überleben und danach wieder angewendet werden.
const overlayData = {};

map.on('style.load', () => {
  if (!map.getSource('dem')) {
    map.addSource('dem', {
      type: 'raster-dem',
      tiles: [DEM_TILES],
      encoding: 'terrarium',
      tileSize: 256,
      maxzoom: 13,
      attribution: 'Höhendaten: <a href="https://registry.opendata.aws/terrain-tiles/">Terrain Tiles</a>',
    });
  }
  map.setTerrain({ source: 'dem', exaggeration: 1.25 });

  const firstSymbol = (map.getStyle().layers.find((l) => l.type === 'symbol') || {}).id;
  if (!map.getLayer('hillshade')) {
    map.addLayer({
      id: 'hillshade', type: 'hillshade', source: 'dem',
      paint: { 'hillshade-exaggeration': 0.28 },
    }, firstSymbol);
  }
  applySky();
  applyBuildings();
  addOverlayLayers();
  ready = true;
  pending.splice(0).forEach((fn) => fn());
});

function applySky() {
  try {
    map.setSky(currentTheme === 'dark' ? {
      'sky-color': '#0b1a2b', 'sky-horizon-blend': 0.5,
      'horizon-color': '#20344a', 'horizon-fog-blend': 0.6,
      'fog-color': '#141d29', 'fog-ground-blend': 0.6,
    } : {
      'sky-color': '#8fb8e6', 'sky-horizon-blend': 0.5,
      'horizon-color': '#e6eef5', 'horizon-fog-blend': 0.5,
      'fog-color': '#e7edf2', 'fog-ground-blend': 0.5,
    });
  } catch { /* Sky optional */ }
}

// 3D-Gebäude nur zeigen, wenn 3D aktiv UND aktiviert (Performance-Schalter).
function applyBuildings() {
  if (!map.getLayer('building-3d')) return;
  const on = buildings3dOn && map.getPitch() >= 20;
  map.setLayoutProperty('building-3d', 'visibility', on ? 'visible' : 'none');
}

export function setBuildings3d(on) { buildings3dOn = on; applyBuildings(); }

// Hell/Dunkel umschalten (wechselt den Vektor-Style; Overlays/Marker bleiben).
export function setMapTheme(theme) {
  const t = theme === 'dark' ? 'dark' : 'light';
  if (t === currentTheme) return;
  currentTheme = t;
  ready = false;
  map.setStyle(STYLES[t]); // löst erneut 'style.load' aus → Handler baut alles wieder auf
}

// ---------- Geometrie-Helfer ----------

function geoCircle(lat, lng, radiusM, n = 48) {
  const coords = [];
  const R = 6371000;
  const latR = lat * Math.PI / 180;
  for (let i = 0; i <= n; i++) {
    const brng = (i / n) * 2 * Math.PI;
    const dLat = (radiusM * Math.cos(brng)) / R;
    const dLng = (radiusM * Math.sin(brng)) / (R * Math.cos(latR));
    coords.push([lng + dLng * 180 / Math.PI, lat + dLat * 180 / Math.PI]);
  }
  return coords;
}

function lineFeature(coords) {
  return { type: 'Feature', geometry: { type: 'LineString', coordinates: coords.map((c) => [c[1], c[0]]) } };
}
const EMPTY = { type: 'FeatureCollection', features: [] };

// Setzt Source-Daten UND merkt sie sich (für Style-Wechsel).
function setData(id, data) {
  overlayData[id] = data || EMPTY;
  const src = map.getSource(id);
  if (src) src.setData(overlayData[id]);
}

function addOverlayLayers() {
  const add = (id) => { if (!map.getSource(id)) map.addSource(id, { type: 'geojson', data: overlayData[id] || EMPTY }); };
  add('route'); add('track'); add('pos-acc'); add('shared-acc'); add('target'); add('connector');

  if (!map.getLayer('connector-line')) {
    map.addLayer({
      id: 'connector-line', type: 'line', source: 'connector',
      layout: { 'line-cap': 'round' },
      paint: { 'line-color': '#1a73e8', 'line-width': 2.5, 'line-opacity': 0.8, 'line-dasharray': [1.5, 1.5] },
    });
  }
  if (!map.getLayer('route-line')) {
    map.addLayer({
      id: 'route-line', type: 'line', source: 'route',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': ['case', ['get', 'fallback'], '#e07b00', '#d63a2f'], 'line-width': 5, 'line-opacity': 0.9 },
    });
  }
  if (!map.getLayer('track-line')) {
    map.addLayer({
      id: 'track-line', type: 'line', source: 'track',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#1565c0', 'line-width': 5, 'line-opacity': 0.9 },
    });
  }
  const circleFill = (id, src, color) => {
    if (!map.getLayer(id + '-f')) map.addLayer({ id: id + '-f', type: 'fill', source: src, paint: { 'fill-color': color, 'fill-opacity': 0.12 } });
    if (!map.getLayer(id + '-l')) map.addLayer({ id: id + '-l', type: 'line', source: src, paint: { 'line-color': color, 'line-width': 1, 'line-opacity': 0.5 } });
  };
  circleFill('posacc', 'pos-acc', '#1a73e8');
  circleFill('sharedacc', 'shared-acc', '#8e24aa');
  if (!map.getLayer('target-f')) map.addLayer({ id: 'target-f', type: 'fill', source: 'target', paint: { 'fill-color': '#f39c12', 'fill-opacity': 0.15 } });
  if (!map.getLayer('target-l')) map.addLayer({ id: 'target-l', type: 'line', source: 'target', paint: { 'line-color': '#e67e22', 'line-width': 2, 'line-dasharray': [2, 2] } });
}

// ---------- Klick-Handler / Wegpunkte ----------

let changeHandler = null;
let mapClickEnabled = true;
let clickHandler = null;

export function onWaypointsChanged(fn) { changeHandler = fn; }
export function setMapClickEnabled(enabled) { mapClickEnabled = enabled; }
export function setClickHandler(fn) { clickHandler = fn; }
function notifyChange() { if (changeHandler) changeHandler(); }

map.on('click', (e) => {
  const ll = { lat: e.lngLat.lat, lng: e.lngLat.lng };
  if (clickHandler) { clickHandler(ll); return; }
  if (mapClickEnabled) addWaypoint(ll);
});

let waypointMarkers = [];

function waypointElement(index, total) {
  const el = document.createElement('div');
  el.className = 'wp-icon' + (index === 0 ? ' wp-start' : index === total - 1 ? ' wp-end' : '');
  el.innerHTML = `<span>${index + 1}</span>`;
  return el;
}

function renumberWaypoints() {
  waypointMarkers.forEach((m, i) => {
    const el = m.getElement();
    el.className = 'wp-icon' + (i === 0 ? ' wp-start' : i === waypointMarkers.length - 1 ? ' wp-end' : '');
    el.querySelector('span').textContent = i + 1;
  });
}

function createWaypointMarker(latlng) {
  const el = waypointElement(0, 1);
  const marker = new maplibregl.Marker({ element: el, anchor: 'center', draggable: true })
    .setLngLat([latlng.lng, latlng.lat])
    .addTo(map);
  let dragged = false;
  marker.on('dragstart', () => { dragged = false; });
  marker.on('drag', () => { dragged = true; });
  marker.on('dragend', () => { setTimeout(() => { dragged = false; }, 0); notifyChange(); });
  el.addEventListener('click', (ev) => {
    ev.stopPropagation();
    if (dragged) return;
    waypointMarkers = waypointMarkers.filter((m) => m !== marker);
    marker.remove();
    renumberWaypoints();
    notifyChange();
  });
  return marker;
}

export function addWaypoint(latlng) {
  waypointMarkers.push(createWaypointMarker(latlng));
  renumberWaypoints();
  notifyChange();
}

export function undoWaypoint() {
  const m = waypointMarkers.pop();
  if (m) m.remove();
  renumberWaypoints();
  notifyChange();
}

export function reverseWaypoints() {
  waypointMarkers.reverse();
  renumberWaypoints();
  notifyChange();
}

export function clearWaypoints({ silent = false } = {}) {
  waypointMarkers.forEach((m) => m.remove());
  waypointMarkers = [];
  if (!silent) notifyChange();
}

export function setWaypoints(latlngs) {
  clearWaypoints({ silent: true });
  waypointMarkers = latlngs.map((ll) => createWaypointMarker(ll));
  renumberWaypoints();
  notifyChange();
}

export function getWaypoints() {
  return waypointMarkers.map((m) => {
    const ll = m.getLngLat();
    return { lat: ll.lat, lng: ll.lng };
  });
}

// ---------- Routen-/Track-Linien ----------

export function drawRoute(coords, { fallback = false } = {}) {
  whenReady(() => {
    if (!coords || coords.length < 2) { setData('route', EMPTY); return; }
    const f = lineFeature(coords);
    f.properties = { fallback };
    setData('route', { type: 'FeatureCollection', features: [f] });
  });
}
export function clearRouteLine() { whenReady(() => setData('route', EMPTY)); }

let trackCoords = [];
export function setTrack(coords) {
  trackCoords = coords ? coords.map((c) => [c[0], c[1]]) : [];
  whenReady(() => setData('track', trackCoords.length >= 2 ? { type: 'FeatureCollection', features: [lineFeature(trackCoords)] } : EMPTY));
}
export function appendTrackPoint(lat, lng) {
  trackCoords.push([lat, lng]);
  whenReady(() => setData('track', trackCoords.length >= 2 ? { type: 'FeatureCollection', features: [lineFeature(trackCoords)] } : EMPTY));
}
export function clearTrackLine() { trackCoords = []; whenReady(() => setData('track', EMPTY)); }

export function fitToCoords(coords) {
  if (!coords || coords.length < 2) return;
  let minLat = 90, minLng = 180, maxLat = -90, maxLng = -180;
  for (const c of coords) {
    minLat = Math.min(minLat, c[0]); maxLat = Math.max(maxLat, c[0]);
    minLng = Math.min(minLng, c[1]); maxLng = Math.max(maxLng, c[1]);
  }
  map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 70, duration: 700, essential: true });
}

// ---------- Facade ----------

export function setView(lat, lng, zoom) {
  map.easeTo({ center: [lng, lat], zoom: zoom != null ? zoom : map.getZoom(), duration: 500, essential: true });
}
export function panTo(lat, lng, zoom) { setView(lat, lng, zoom); }
export function flyTo(lat, lng, zoom) {
  map.flyTo({ center: [lng, lat], zoom: zoom != null ? zoom : Math.max(map.getZoom(), 14), speed: 1.4, curve: 1.5, essential: true });
}
export function getZoom() { return map.getZoom(); }
export function getCenter() { const c = map.getCenter(); return { lat: c.lat, lng: c.lng }; }
export function resize() { map.resize(); }
export function onDragStart(cb) { map.on('dragstart', cb); }
export function onMoveEnd(cb) { map.on('moveend', cb); }

export function toggle3D() {
  const to3d = map.getPitch() < 20;
  map.easeTo({ pitch: to3d ? 55 : 0, bearing: to3d ? map.getBearing() : 0, duration: 500, essential: true });
  setTimeout(applyBuildings, 550);
  return to3d;
}
export function is3D() { return map.getPitch() >= 20; }

// ---------- Eigene Position (blauer Punkt) ----------

let posMarker = null;
let posEl = null;

export function updatePosition(lat, lng, accuracy) {
  if (!posMarker) {
    posEl = document.createElement('div');
    posEl.className = 'pos-icon';
    posEl.innerHTML = '<div class="pos-cone"></div><div class="pos-core"></div><div class="pos-label"></div>';
    posMarker = new maplibregl.Marker({ element: posEl, anchor: 'center' }).setLngLat([lng, lat]).addTo(map);
  } else {
    posMarker.setLngLat([lng, lat]);
  }
  whenReady(() => setData('pos-acc', accuracy ? { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [geoCircle(lat, lng, accuracy)] } }] } : EMPTY));
}

export function setPositionHeading(deg) {
  if (!posEl) return;
  posEl.classList.add('has-heading');
  const cone = posEl.querySelector('.pos-cone');
  if (cone) cone.style.transform = `rotate(${deg}deg)`;
}

export function setPositionLabel(name) {
  if (!posEl) return;
  const label = posEl.querySelector('.pos-label');
  if (label) { label.textContent = name || ''; label.style.display = name ? 'block' : 'none'; }
}

export function removePosition() {
  if (posMarker) { posMarker.remove(); posMarker = null; posEl = null; }
  whenReady(() => setData('pos-acc', EMPTY));
}

export function hasPosition() { return !!posMarker; }
export function getPositionLngLat() { return posMarker ? posMarker.getLngLat() : null; }

// ---------- Verbindungslinie (Luftlinie ich ↔ verfolgte Person) ----------

export function setConnector(from, to) {
  whenReady(() => setData('connector', {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: [[from.lng, from.lat], [to.lng, to.lat]] } }],
  }));
}
export function clearConnector() { whenReady(() => setData('connector', EMPTY)); }

// ---------- Geteilte Position (Solo-Betrachter) ----------

let sharedMarker = null;

export function updateSharedPosition(lat, lng, accuracy, label) {
  if (!sharedMarker) {
    const el = document.createElement('div');
    el.className = 'shared-icon';
    el.innerHTML = '<div class="shared-pulse"></div><div class="shared-dot">🥾</div><div class="shared-name"></div>';
    sharedMarker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([lng, lat]).addTo(map);
  } else {
    sharedMarker.setLngLat([lng, lat]);
  }
  if (label) sharedMarker.getElement().querySelector('.shared-name').textContent = label;
  whenReady(() => setData('shared-acc', accuracy ? { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [geoCircle(lat, lng, accuracy)] } }] } : EMPTY));
}

export function removeSharedPosition() {
  if (sharedMarker) { sharedMarker.remove(); sharedMarker = null; }
  whenReady(() => setData('shared-acc', EMPTY));
}

// ---------- Gruppe: mehrere Teilnehmer ----------

const peerMarkers = new Map();

export function updatePeer(pid, { lat, lng, color = '#8e24aa', name = '' }) {
  let entry = peerMarkers.get(pid);
  if (!entry) {
    const el = document.createElement('div');
    el.className = 'peer-icon';
    el.innerHTML = '<div class="peer-pulse"></div><div class="peer-dot"><span></span></div><div class="peer-name"></div>';
    const marker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([lng, lat]).addTo(map);
    entry = { marker, el };
    peerMarkers.set(pid, entry);
  } else {
    entry.marker.setLngLat([lng, lat]);
  }
  entry.el.style.setProperty('--peer', color);
  entry.el.querySelector('.peer-dot span').textContent = (name || '?').slice(0, 2).toUpperCase();
  entry.el.querySelector('.peer-name').textContent = name || '';
}

export function removePeer(pid) {
  const e = peerMarkers.get(pid);
  if (e) { e.marker.remove(); peerMarkers.delete(pid); }
}

export function clearPeers() {
  peerMarkers.forEach((e) => e.marker.remove());
  peerMarkers.clear();
}

// ---------- Ziel ----------

let targetMarker = null;

export function setTarget(lat, lng, radius) {
  if (!targetMarker) {
    const el = document.createElement('div');
    el.className = 'target-icon';
    el.textContent = '🎯';
    targetMarker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([lng, lat]).addTo(map);
  } else {
    targetMarker.setLngLat([lng, lat]);
  }
  whenReady(() => setData('target', { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [geoCircle(lat, lng, radius)] } }] }));
}

export function clearTarget() {
  if (targetMarker) { targetMarker.remove(); targetMarker = null; }
  whenReady(() => setData('target', EMPTY));
}

// ---------- Höhenprofil-Hervorhebung ----------

let highlightMarker = null;

export function showHighlight(lat, lng) {
  if (!highlightMarker) {
    const el = document.createElement('div');
    el.className = 'hl-icon';
    highlightMarker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([lng, lat]).addTo(map);
  } else {
    highlightMarker.setLngLat([lng, lat]);
  }
}

export function hideHighlight() {
  if (highlightMarker) { highlightMarker.remove(); highlightMarker = null; }
}
