// Ortssuche & Reverse-Geocoding über OpenStreetMap-Nominatim (kostenlos, kein
// API-Key). Fair-Use: sparsam anfragen (entprellt im UI), Ergebnisse mit
// Nähebezug zur aktuellen Position.

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_REV = 'https://nominatim.openstreetmap.org/reverse';

const KIND_EMOJI = {
  peak: '⛰️', volcano: '🌋', ridge: '⛰️', saddle: '⛰️',
  alpine_hut: '🛖', wilderness_hut: '🛖', hut: '🛖', shelter: '⛺', chalet: '🛖',
  spring: '💧', water: '💧', drinking_water: '💧', lake: '🏞️', river: '🏞️', waterfall: '💦',
  viewpoint: '🔭', attraction: '📸', castle: '🏰', ruins: '🏚️',
  city: '🏙️', town: '🏙️', village: '🏘️', hamlet: '🏘️', suburb: '🏘️',
  station: '🚉', bus_stop: '🚏', parking: '🅿️',
  hotel: '🏨', guest_house: '🏨', hostel: '🏨', camp_site: '🏕️',
  restaurant: '🍽️', cafe: '☕', pub: '🍺', bakery: '🥨',
};

export function kindEmoji(kind) { return KIND_EMOJI[kind] || '📍'; }

export async function searchPlaces(query, { limit = 6, lat, lon } = {}) {
  const q = query.trim();
  if (!q) return [];
  let url = `${NOMINATIM}?format=jsonv2&limit=${limit}&addressdetails=0&q=${encodeURIComponent(q)}`;
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    // Nähebezug: Treffer rund um die aktuelle Position/Mitte bevorzugen
    // (bounded=0 → Präferenz, kein harter Filter).
    const d = 1.2; // ~130 km Vorzugsbox
    url += `&viewbox=${lon - d},${lat - d},${lon + d},${lat + d}&bounded=0`;
  }
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Suche fehlgeschlagen (${res.status})`);
  const data = await res.json();
  return (Array.isArray(data) ? data : []).map((d) => ({
    name: d.display_name,
    short: d.name || (d.display_name || '').split(',')[0],
    lat: parseFloat(d.lat),
    lon: parseFloat(d.lon),
    kind: d.type,
  })).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
}

// Ort/Adresse zu Koordinaten (für Karten-Langdruck-Info).
export async function reverseGeocode(lat, lon) {
  const url = `${NOMINATIM_REV}?format=jsonv2&lat=${lat}&lon=${lon}&zoom=14&addressdetails=0`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Reverse-Geocoding fehlgeschlagen (${res.status})`);
  const d = await res.json();
  return {
    name: d.display_name || null,
    short: d.name || (d.display_name || '').split(',')[0] || null,
    kind: d.type || d.category || null,
  };
}
