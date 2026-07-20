// Leaflet-Karte: Layer, Wegpunkte, Routen-/Track-Linien, Positionsmarker

const osmLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende',
});

const topoLayer = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
  maxZoom: 17,
  attribution: 'Karte &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA) · Daten &copy; OpenStreetMap-Mitwirkende',
});

export const map = L.map('map', { layers: [topoLayer], zoomControl: true })
  .setView([47.2692, 11.4041], 13);

L.control.layers(
  { 'OpenTopoMap (Wanderkarte)': topoLayer, 'OpenStreetMap': osmLayer },
  null,
  { position: 'topright' }
).addTo(map);

L.control.scale({ imperial: false }).addTo(map);

// ---------- Wegpunkte ----------

let waypointMarkers = [];
let changeHandler = null;
let mapClickEnabled = true;

export function onWaypointsChanged(fn) {
  changeHandler = fn;
}

export function setMapClickEnabled(enabled) {
  mapClickEnabled = enabled;
}

function notifyChange() {
  if (changeHandler) changeHandler();
}

function waypointIcon(index, total) {
  let cls = 'wp-icon';
  if (index === 0) cls += ' wp-start';
  else if (index === total - 1) cls += ' wp-end';
  return L.divIcon({
    className: cls,
    html: `<span>${index + 1}</span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function renumberWaypoints() {
  waypointMarkers.forEach((m, i) => m.setIcon(waypointIcon(i, waypointMarkers.length)));
}

function createWaypointMarker(latlng) {
  const marker = L.marker(latlng, { draggable: true, icon: waypointIcon(0, 1) });
  marker.on('dragend', notifyChange);
  marker.on('click', () => {
    waypointMarkers = waypointMarkers.filter((m) => m !== marker);
    marker.remove();
    renumberWaypoints();
    notifyChange();
  });
  marker.addTo(map);
  return marker;
}

export function addWaypoint(latlng) {
  waypointMarkers.push(createWaypointMarker(latlng));
  renumberWaypoints();
  notifyChange();
}

export function undoWaypoint() {
  const marker = waypointMarkers.pop();
  if (marker) marker.remove();
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
    const ll = m.getLatLng();
    return { lat: ll.lat, lng: ll.lng };
  });
}

map.on('click', (e) => {
  if (mapClickEnabled) addWaypoint(e.latlng);
});

// ---------- Routen-Linie ----------

let routeLine = null;

export function drawRoute(coords, { fallback = false } = {}) {
  clearRouteLine();
  if (!coords || coords.length < 2) return;
  routeLine = L.polyline(coords.map((c) => [c[0], c[1]]), {
    color: fallback ? '#e07b00' : '#d63a2f',
    weight: 4,
    opacity: 0.85,
    dashArray: fallback ? '6 8' : null,
  }).addTo(map);
}

export function clearRouteLine() {
  if (routeLine) {
    routeLine.remove();
    routeLine = null;
  }
}

export function fitToCoords(coords) {
  if (!coords || coords.length < 2) return;
  map.fitBounds(L.latLngBounds(coords.map((c) => [c[0], c[1]])), { padding: [40, 40] });
}

// ---------- Track-Linie (Aufzeichnung) ----------

let trackLine = null;

export function setTrack(coords) {
  clearTrackLine();
  if (!coords || coords.length < 2) return;
  trackLine = L.polyline(coords.map((c) => [c[0], c[1]]), {
    color: '#1565c0',
    weight: 4,
    opacity: 0.9,
  }).addTo(map);
}

export function appendTrackPoint(lat, lng) {
  if (!trackLine) {
    trackLine = L.polyline([[lat, lng]], { color: '#1565c0', weight: 4, opacity: 0.9 }).addTo(map);
  } else {
    trackLine.addLatLng([lat, lng]);
  }
}

export function clearTrackLine() {
  if (trackLine) {
    trackLine.remove();
    trackLine = null;
  }
}

// ---------- Eigene Position ----------

let posMarker = null;
let accCircle = null;

export function updatePosition(lat, lng, accuracy) {
  if (!posMarker) {
    posMarker = L.marker([lat, lng], {
      interactive: false,
      keyboard: false,
      icon: L.divIcon({
        className: 'pos-icon',
        html: '<div class="pos-arrow"></div><div class="pos-dot"></div>',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      }),
      zIndexOffset: 900,
    }).addTo(map);
    accCircle = L.circle([lat, lng], {
      radius: accuracy || 0,
      weight: 1,
      color: '#1a73e8',
      fillColor: '#1a73e8',
      fillOpacity: 0.12,
      interactive: false,
    }).addTo(map);
  } else {
    posMarker.setLatLng([lat, lng]);
    accCircle.setLatLng([lat, lng]);
    accCircle.setRadius(accuracy || 0);
  }
}

export function setPositionHeading(deg) {
  if (!posMarker) return;
  const el = posMarker.getElement();
  if (!el) return;
  el.classList.add('has-heading');
  const arrow = el.querySelector('.pos-arrow');
  if (arrow) arrow.style.transform = `rotate(${deg}deg)`;
}

export function removePosition() {
  if (posMarker) { posMarker.remove(); posMarker = null; }
  if (accCircle) { accCircle.remove(); accCircle = null; }
}

// ---------- Hervorhebung (Höhenprofil-Hover) ----------

let highlightMarker = null;

export function showHighlight(lat, lng) {
  if (!highlightMarker) {
    highlightMarker = L.circleMarker([lat, lng], {
      radius: 7,
      color: '#fff',
      weight: 2,
      fillColor: '#d63a2f',
      fillOpacity: 1,
      interactive: false,
    }).addTo(map);
  } else {
    highlightMarker.setLatLng([lat, lng]);
  }
}

export function hideHighlight() {
  if (highlightMarker) {
    highlightMarker.remove();
    highlightMarker = null;
  }
}

// ---------- Geteilte Position (von jemand anderem) ----------

let sharedMarker = null;
let sharedAccCircle = null;

export function updateSharedPosition(lat, lng, accuracy, label) {
  if (!sharedMarker) {
    sharedMarker = L.marker([lat, lng], {
      interactive: true,
      keyboard: false,
      icon: L.divIcon({
        className: 'shared-icon',
        html: '<div class="shared-pulse"></div><div class="shared-dot">🥾</div>',
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      }),
      zIndexOffset: 1000,
    }).addTo(map);
    sharedAccCircle = L.circle([lat, lng], {
      radius: accuracy || 0,
      weight: 1,
      color: '#8e24aa',
      fillColor: '#8e24aa',
      fillOpacity: 0.12,
      interactive: false,
    }).addTo(map);
  } else {
    sharedMarker.setLatLng([lat, lng]);
    sharedAccCircle.setLatLng([lat, lng]);
    sharedAccCircle.setRadius(accuracy || 0);
  }
  if (label) sharedMarker.bindTooltip(label, { direction: 'top', offset: [0, -14] });
}

export function removeSharedPosition() {
  if (sharedMarker) { sharedMarker.remove(); sharedMarker = null; }
  if (sharedAccCircle) { sharedAccCircle.remove(); sharedAccCircle = null; }
}

export function panTo(lat, lng, zoom) {
  map.setView([lat, lng], zoom || map.getZoom());
}
