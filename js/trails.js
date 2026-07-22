// Vorgefertigte Wanderwege aus OpenStreetMap (route=hiking-Relationen), keyless.
// Overpass liefert Relationen mit Geometrie; wir setzen die Wegstücke zu einer
// durchgehenden Linie zusammen und geben Name + Länge zurück.

import { haversine } from './routing.js';

const OVERPASS_HOSTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

async function overpass(query) {
  let lastErr = null;
  for (const host of OVERPASS_HOSTS) {
    try {
      const res = await fetch(host, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query),
        signal: AbortSignal.timeout(25000),
      });
      if (!res.ok) throw new Error('Overpass ' + res.status);
      return await res.json();
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('Overpass nicht erreichbar');
}

// Wegstücke (Ways einer Relation) greedy zu einer durchgehenden Linie verketten.
function stitch(ways) {
  if (!ways.length) return [];
  const used = new Array(ways.length).fill(false);
  let line = ways[0].slice();
  used[0] = true;
  for (let k = 1; k < ways.length; k++) {
    const tail = line[line.length - 1];
    let bestI = -1; let bestFlip = false; let bestGap = Infinity;
    for (let i = 0; i < ways.length; i++) {
      if (used[i]) continue;
      const w = ways[i];
      const dHead = haversine(tail[0], tail[1], w[0][0], w[0][1]);
      const dTail = haversine(tail[0], tail[1], w[w.length - 1][0], w[w.length - 1][1]);
      if (dHead < bestGap) { bestGap = dHead; bestI = i; bestFlip = false; }
      if (dTail < bestGap) { bestGap = dTail; bestI = i; bestFlip = true; }
    }
    if (bestI < 0 || bestGap > 2000) break; // größere Lücke → abbrechen (unpassend)
    used[bestI] = true;
    const w = bestFlip ? ways[bestI].slice().reverse() : ways[bestI];
    line = line.concat(w);
  }
  return line;
}

function lineLength(coords) {
  let d = 0;
  for (let i = 1; i < coords.length; i++) d += haversine(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1]);
  return d;
}

// Liefert eine Liste naher Wanderwege: { name, ref, coords:[[lat,lon],…], length, dist }.
export async function fetchHikingRoutes(lat, lon, { radiusM = 12000, limit = 12 } = {}) {
  const q = `[out:json][timeout:25];relation[route=hiking][name](around:${radiusM},${lat.toFixed(5)},${lon.toFixed(5)});out tags geom ${Math.max(limit * 4, 40)};`;
  const data = await overpass(q);
  const out = [];
  for (const rel of (data.elements || [])) {
    if (rel.type !== 'relation' || !rel.members) continue;
    const ways = rel.members
      .filter((m) => m.type === 'way' && Array.isArray(m.geometry) && m.geometry.length > 1)
      .map((m) => m.geometry.map((g) => [g.lat, g.lon]));
    if (!ways.length) continue;
    const coords = stitch(ways);
    if (coords.length < 2) continue;
    const length = lineLength(coords);
    // grober Abstand: nächster Linienpunkt zum Bezugspunkt
    let dist = Infinity;
    for (const c of coords) { const d = haversine(lat, lon, c[0], c[1]); if (d < dist) dist = d; }
    const t = rel.tags || {};
    out.push({
      name: t.name || t.ref || 'Wanderweg',
      ref: t.ref || '',
      symbol: t.osmc_symbol || t['symbol'] || '',
      coords,
      length: Math.round(length),
      dist: Math.round(dist),
    });
  }
  // nach Nähe sortieren, Duplikate (gleicher Name) zusammenfassen
  const seen = new Set();
  return out
    .sort((a, b) => a.dist - b.dist)
    .filter((r) => { const k = r.name + '|' + Math.round(r.length / 100); if (seen.has(k)) return false; seen.add(k); return true; })
    .slice(0, limit);
}
