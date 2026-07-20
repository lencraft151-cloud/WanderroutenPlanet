// GPX 1.1 erzeugen und einlesen.

function escapeXML(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function gpxHeader(name) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="WanderPlan" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${escapeXML(name)}</name>
    <time>${new Date().toISOString()}</time>
  </metadata>
`;
}

// Geplante Route: Wegpunkte als <wpt>, Geometrie als <trk>.
export function routeToGPX(name, coords, waypoints = []) {
  let gpx = gpxHeader(name);
  waypoints.forEach((wp, i) => {
    gpx += `  <wpt lat="${wp.lat.toFixed(6)}" lon="${wp.lng.toFixed(6)}"><name>WP ${i + 1}</name></wpt>\n`;
  });
  gpx += `  <trk>\n    <name>${escapeXML(name)}</name>\n    <trkseg>\n`;
  for (const c of coords) {
    gpx += `      <trkpt lat="${c[0].toFixed(6)}" lon="${c[1].toFixed(6)}">${c[2] != null ? `<ele>${Math.round(c[2])}</ele>` : ''}</trkpt>\n`;
  }
  gpx += '    </trkseg>\n  </trk>\n</gpx>\n';
  return gpx;
}

// Aufgezeichneter Track: Punkte mit Zeitstempel.
export function trackToGPX(name, points) {
  let gpx = gpxHeader(name);
  gpx += `  <trk>\n    <name>${escapeXML(name)}</name>\n    <trkseg>\n`;
  for (const p of points) {
    gpx += `      <trkpt lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}">`
      + (p.ele != null ? `<ele>${p.ele.toFixed(1)}</ele>` : '')
      + (p.time ? `<time>${new Date(p.time).toISOString()}</time>` : '')
      + '</trkpt>\n';
  }
  gpx += '    </trkseg>\n  </trk>\n</gpx>\n';
  return gpx;
}

// Liest trkpt (oder rtept als Fallback) und wpt aus einer GPX-Datei.
export function parseGPX(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) {
    throw new Error('Die Datei ist kein gültiges GPX/XML.');
  }
  const readPoints = (selector) => Array.from(doc.querySelectorAll(selector)).map((pt) => {
    const lat = parseFloat(pt.getAttribute('lat'));
    const lon = parseFloat(pt.getAttribute('lon'));
    const eleEl = pt.querySelector('ele');
    const ele = eleEl ? parseFloat(eleEl.textContent) : null;
    return [lat, lon, Number.isNaN(ele) ? null : ele];
  }).filter((c) => !Number.isNaN(c[0]) && !Number.isNaN(c[1]));

  let coords = readPoints('trkpt');
  if (coords.length < 2) coords = readPoints('rtept');
  if (coords.length < 2) throw new Error('Die GPX-Datei enthält keinen Track (trkpt/rtept).');

  const nameEl = doc.querySelector('trk > name, metadata > name, gpx > name');
  const waypoints = Array.from(doc.querySelectorAll('wpt')).map((pt) => ({
    lat: parseFloat(pt.getAttribute('lat')),
    lng: parseFloat(pt.getAttribute('lon')),
  })).filter((p) => !Number.isNaN(p.lat) && !Number.isNaN(p.lng));

  return {
    name: nameEl ? nameEl.textContent.trim() : 'Importierte Route',
    coords,
    waypoints,
  };
}

export function downloadGPX(filename, content) {
  const blob = new Blob([content], { type: 'application/gpx+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.gpx') ? filename : `${filename}.gpx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
