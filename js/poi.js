// Interessante Orte (POI) in der Nähe – über die Overpass-API von
// OpenStreetMap (kostenlos, kein API-Key). Für Wandernde relevante Kategorien:
// Hütten, Gipfel, Quellen/Trinkwasser, Aussichtspunkte, Schutzhütten, Bänke.
//
// Fair-Use: nur auf Knopfdruck abfragen, Radius/Anzahl begrenzt.

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

// Kategorie-Zuordnung: Tag → { emoji, label }. Reihenfolge = Priorität.
function classify(tags) {
  if (!tags) return null;
  const t = tags;
  if (t.aerialway) return { cat: 'lift', emoji: '🚠', label: 'Seilbahn/Lift' };
  if (t.tourism === 'alpine_hut' || t.tourism === 'wilderness_hut') return { cat: 'hut', emoji: '🛖', label: 'Alm-/Berghütte' };
  if (t.amenity === 'shelter' || t.shelter_type) return { cat: 'shelter', emoji: '⛺', label: 'Schutzhütte' };
  if (t.mountain_pass === 'yes' || t.natural === 'saddle') return { cat: 'pass', emoji: '⛰️', label: 'Pass/Sattel' };
  if (t.natural === 'peak') return { cat: 'peak', emoji: '⛰️', label: 'Gipfel' };
  if (t.tourism === 'viewpoint') return { cat: 'viewpoint', emoji: '🔭', label: 'Aussicht' };
  if (t.natural === 'spring' || t.amenity === 'drinking_water') return { cat: 'water', emoji: '💧', label: 'Wasser' };
  if (t.amenity === 'restaurant' || t.amenity === 'cafe') return { cat: 'food', emoji: '🍽️', label: 'Einkehr' };
  if (t.amenity === 'bench') return { cat: 'bench', emoji: '🪑', label: 'Bank' };
  return null;
}

function buildQuery(lat, lon, radiusM) {
  const a = `(around:${Math.round(radiusM)},${lat.toFixed(5)},${lon.toFixed(5)})`;
  return `[out:json][timeout:25];(` +
    `node["tourism"~"^(alpine_hut|wilderness_hut|viewpoint)$"]${a};` +
    `node["natural"~"^(peak|spring|saddle)$"]${a};` +
    `node["mountain_pass"="yes"]${a};` +
    `node["amenity"~"^(drinking_water|shelter|bench|restaurant|cafe)$"]${a};` +
    `node["aerialway"="station"]${a};` +
    `);out body ${150};`;
}

// Liefert bis `limit` POIs, nach Entfernung zur Mitte sortiert.
export async function fetchPois(lat, lon, { radiusM = 4000, limit = 40 } = {}) {
  const body = 'data=' + encodeURIComponent(buildQuery(lat, lon, radiusM));
  let lastErr = null;
  for (const url of ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20000);
      let res;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
          signal: controller.signal,
        });
      } finally { clearTimeout(timer); }
      if (!res.ok) throw new Error(`Overpass ${res.status}`);
      const data = await res.json();
      const els = Array.isArray(data.elements) ? data.elements : [];
      const seen = new Set();
      const out = [];
      for (const el of els) {
        if (el.type !== 'node' || el.lat == null) continue;
        const info = classify(el.tags);
        if (!info) continue;
        const name = (el.tags && (el.tags.name || el.tags['name:de'])) || info.label;
        const key = info.cat + '|' + name + '|' + el.lat.toFixed(4) + '|' + el.lon.toFixed(4);
        if (seen.has(key)) continue;
        seen.add(key);
        const d = haversineM(lat, lon, el.lat, el.lon);
        out.push({ id: el.id, lat: el.lat, lon: el.lon, name, ...info, dist: d, ele: el.tags && el.tags.ele ? parseInt(el.tags.ele, 10) : null });
      }
      out.sort((p, q) => p.dist - q.dist);
      return out.slice(0, limit);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('Overpass nicht erreichbar');
}

function haversineM(lat1, lon1, lat2, lon2) {
  const R = 6371000, toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad, dLon = (lon2 - lon1) * toRad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
