// Ortssuche über OpenStreetMap-Nominatim (kostenlos, kein API-Key).
// Fair-Use: sparsam anfragen (Suche nur bei Bedarf, entprellt im UI).

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

export async function searchPlaces(query, { limit = 5 } = {}) {
  const q = query.trim();
  if (!q) return [];
  const url = `${NOMINATIM}?format=jsonv2&limit=${limit}&addressdetails=0&q=${encodeURIComponent(q)}`;
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
