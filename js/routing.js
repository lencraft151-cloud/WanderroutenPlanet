// Routenberechnung: BRouter (Wanderwege) mit Luftlinien-Fallback,
// Distanz-/Höhenmeter-Statistik und Gehzeit nach DAV-Formel.

// Mehrere BRouter-Server, damit möglichst immer eine echte Wanderroute
// herauskommt (nicht die Luftlinie).
const BROUTER_HOSTS = [
  'https://brouter.de/brouter',
  'https://bikerouter.de/brouter',
];
const ELEVATION_URL = 'https://api.open-meteo.com/v1/elevation';

// Die UI-Auswahl auf tatsächlich existierende BRouter-Profile abbilden.
// („hiking-mountain" gibt es bei BRouter NICHT → führte bisher zur Luftlinie.)
const PROFILE_MAP = {
  'hiking-mountain': 'hiking-beta',
  'trekking': 'trekking',
  'shortest': 'shortest',
};
function brouterProfile(profile) { return PROFILE_MAP[profile] || 'trekking'; }

const EARTH_RADIUS = 6371000;

export function haversine(lat1, lon1, lat2, lon2) {
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.sqrt(a));
}

// Auf-/Abstieg mit 10-m-Hysterese, damit GPS-/Datenrauschen nicht
// als Höhenmeter gezählt wird.
export function elevationGain(coords) {
  let ascent = 0;
  let descent = 0;
  let ref = null;
  let hasEle = false;
  for (const c of coords) {
    const ele = c[2];
    if (ele == null || Number.isNaN(ele)) continue;
    hasEle = true;
    if (ref === null) { ref = ele; continue; }
    const delta = ele - ref;
    if (delta >= 10) { ascent += delta; ref = ele; }
    else if (delta <= -10) { descent += -delta; ref = ele; }
  }
  return hasEle ? { ascent: Math.round(ascent), descent: Math.round(descent) } : { ascent: null, descent: null };
}

// Gehzeit nach DAV: 4 km/h horizontal, 300 Hm/h bergauf, 500 Hm/h bergab;
// Gesamtzeit = größerer Wert + halber kleinerer Wert.
export function hikingDuration(distance, ascent, descent) {
  const horiz = distance / 1000 / 4;
  const vert = (ascent || 0) / 300 + (descent || 0) / 500;
  const hours = Math.max(horiz, vert) + Math.min(horiz, vert) / 2;
  return Math.round(hours * 3600);
}

export function computeStats(coords) {
  let distance = 0;
  for (let i = 1; i < coords.length; i++) {
    distance += haversine(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1]);
  }
  const { ascent, descent } = elevationGain(coords);
  return {
    distance: Math.round(distance),
    ascent,
    descent,
    duration: hikingDuration(distance, ascent, descent),
  };
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchBRouterOnce(host, waypoints, prof) {
  const lonlats = waypoints.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join('|');
  const url = `${host}?lonlats=${lonlats}&profile=${encodeURIComponent(prof)}&alternativeidx=0&format=geojson`;
  const res = await fetchWithTimeout(url, 12000);
  if (!res.ok) throw new Error(`BRouter-Fehler ${res.status}`);
  const geojson = await res.json();
  const feature = geojson.features && geojson.features[0];
  const lineCoords = feature && feature.geometry && feature.geometry.coordinates;
  if (!lineCoords || lineCoords.length < 2) throw new Error('BRouter lieferte keine Route');
  // GeoJSON ist [lon, lat, ele] → intern [lat, lon, ele]
  return lineCoords.map((c) => [c[1], c[0], c.length > 2 ? c[2] : null]);
}

// Versucht mehrere Server/Profile, damit möglichst immer eine Wanderroute
// zustande kommt. Reihenfolge: gewähltes Profil auf beiden Servern, dann als
// Rückfall „trekking" (auch ein Wanderweg-Profil) – erst danach Luftlinie.
async function fetchBRouter(waypoints, profile) {
  const prof = brouterProfile(profile);
  const candidates = [];
  for (const host of BROUTER_HOSTS) candidates.push([host, prof]);
  if (prof !== 'trekking') for (const host of BROUTER_HOSTS) candidates.push([host, 'trekking']);
  let lastErr = null;
  for (const [host, p] of candidates) {
    try { return await fetchBRouterOnce(host, waypoints, p); }
    catch (err) { lastErr = err; }
  }
  throw lastErr || new Error('BRouter nicht erreichbar');
}

// Luftlinie: Segmente in Zwischenpunkte unterteilen (max. 100 Punkte gesamt,
// damit eine einzige Open-Meteo-Abfrage für die Höhen reicht).
function straightLineCoords(waypoints) {
  let totalDist = 0;
  for (let i = 1; i < waypoints.length; i++) {
    totalDist += haversine(waypoints[i - 1].lat, waypoints[i - 1].lng, waypoints[i].lat, waypoints[i].lng);
  }
  const stepDist = Math.max(totalDist / (100 - waypoints.length), 50);
  const coords = [];
  for (let i = 1; i < waypoints.length; i++) {
    const a = waypoints[i - 1];
    const b = waypoints[i];
    const segDist = haversine(a.lat, a.lng, b.lat, b.lng);
    const steps = Math.max(Math.floor(segDist / stepDist), 1);
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      coords.push([a.lat + (b.lat - a.lat) * t, a.lng + (b.lng - a.lng) * t, null]);
    }
  }
  const last = waypoints[waypoints.length - 1];
  coords.push([last.lat, last.lng, null]);
  return coords;
}

export async function fetchElevations(points /* [[lat, lon], ...] max 100 */) {
  const lats = points.map((p) => p[0].toFixed(5)).join(',');
  const lons = points.map((p) => p[1].toFixed(5)).join(',');
  const res = await fetchWithTimeout(`${ELEVATION_URL}?latitude=${lats}&longitude=${lons}`, 10000);
  if (!res.ok) throw new Error(`Elevation-API-Fehler ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data.elevation)) throw new Error('Elevation-API: unerwartete Antwort');
  return data.elevation;
}

async function straightLineRoute(waypoints) {
  const coords = straightLineCoords(waypoints);
  try {
    const elevations = await fetchElevations(coords);
    coords.forEach((c, i) => { c[2] = elevations[i] ?? null; });
  } catch (err) {
    console.warn('Höhendaten nicht verfügbar:', err);
  }
  return coords;
}

// Liefert { coords: [[lat, lon, ele], ...], stats, fallback }.
// fallback=true bedeutet: Luftlinie statt Wanderweg-Routing.
export async function calculateRoute(waypoints, profile) {
  if (!waypoints || waypoints.length < 2) return null;
  let coords;
  let fallback = false;
  try {
    coords = await fetchBRouter(waypoints, profile);
  } catch (err) {
    console.warn('BRouter nicht verfügbar, verwende Luftlinie:', err);
    coords = await straightLineRoute(waypoints);
    fallback = true;
  }
  return { coords, stats: computeStats(coords), fallback };
}
