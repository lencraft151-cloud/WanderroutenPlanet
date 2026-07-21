// Schwierigkeitsgrad & Steigungsanalyse einer Route.
//
// Grober SAC-Wanderskala-Wert (T1–T5) aus Distanz, Anstieg und maximaler
// (geglätteter) Steigung. Zusätzlich Segment-Daten für die Steigungs-Einfärbung
// auf der Karte. Rein heuristisch – als Orientierung, kein Ersatz für Tourinfos.

const R = 6371000;
function haversine(lat1, lon1, lat2, lon2) {
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad, dLon = (lon2 - lon1) * toRad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const GRADES = {
  T1: { label: 'Wandern', color: '#2e9e4f' },
  T2: { label: 'Bergwandern', color: '#8ab800' },
  T3: { label: 'anspruchsvolles Bergwandern', color: '#e0a800' },
  T4: { label: 'Alpinwandern', color: '#e07b00' },
  T5: { label: 'anspruchsvolles Alpinwandern', color: '#d63a2f' },
};

// Geglättete Steigung über ~40-m-Fenster, damit GPS-/DEM-Rauschen nicht als
// extreme Steigung zählt. Liefert Fenster mit { grade (%), a, b } (Indizes).
function windowGrades(coords, windowM = 40) {
  const wins = [];
  let i = 0;
  while (i < coords.length - 1) {
    let j = i, dist = 0;
    while (j < coords.length - 1 && dist < windowM) {
      dist += haversine(coords[j][0], coords[j][1], coords[j + 1][0], coords[j + 1][1]);
      j++;
    }
    const e1 = coords[i][2], e2 = coords[j][2];
    if (dist > 5 && e1 != null && e2 != null && !Number.isNaN(e1) && !Number.isNaN(e2)) {
      wins.push({ grade: ((e2 - e1) / dist) * 100, a: i, b: j });
    } else {
      wins.push({ grade: 0, a: i, b: j });
    }
    i = j;
  }
  return wins;
}

// { grade:'T2', label, color, maxGrade, avgAbsGrade }
export function computeDifficulty(coords, stats) {
  if (!coords || coords.length < 2) return null;
  const wins = windowGrades(coords);
  const abs = wins.map((w) => Math.abs(w.grade)).filter((g) => Number.isFinite(g));
  abs.sort((a, b) => a - b);
  // 95. Perzentil als „maximale" Steigung (robust gegen Ausreißer).
  const maxGrade = abs.length ? abs[Math.min(abs.length - 1, Math.floor(abs.length * 0.95))] : 0;
  const avgAbsGrade = abs.length ? abs.reduce((s, g) => s + g, 0) / abs.length : 0;
  const ascent = stats && stats.ascent != null ? stats.ascent : 0;

  let g = 'T1';
  if (maxGrade >= 45 || ascent >= 1800) g = 'T5';
  else if (maxGrade >= 38 || ascent >= 1400) g = 'T4';
  else if (maxGrade >= 30 || ascent >= 1000) g = 'T3';
  else if (maxGrade >= 18 || ascent >= 500) g = 'T2';

  return { grade: g, ...GRADES[g], maxGrade: Math.round(maxGrade), avgAbsGrade: Math.round(avgAbsGrade) };
}

// GeoJSON-Segmente mit Steigungs-Property (|%|) für die Karten-Einfärbung.
// coords: [[lat,lon,ele], …] → LineString-Segmente [lon,lat].
export function buildGradeSegments(coords) {
  if (!coords || coords.length < 2) return { type: 'FeatureCollection', features: [] };
  const wins = windowGrades(coords);
  const features = wins.map((w) => {
    const seg = coords.slice(w.a, w.b + 1).map((c) => [c[1], c[0]]);
    return { type: 'Feature', properties: { grade: Math.abs(Math.round(w.grade)) }, geometry: { type: 'LineString', coordinates: seg } };
  }).filter((f) => f.geometry.coordinates.length >= 2);
  return { type: 'FeatureCollection', features };
}
