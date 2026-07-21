// Kompaktes Kodieren/Dekodieren einer geplanten Route für Teil-Links und für
// das Mitsenden an Live-Betrachter. Kodiert werden das Routing-Profil und die
// Wegpunkte (nicht die volle Linie) – kurz und beim Empfänger via BRouter
// exakt reproduzierbar. Koordinaten als Delta-Ganzzahlen (1e-5 Grad ≈ 1 m),
// dann Base64url – ohne externe Bibliothek.

const PROFILES = ['hiking-mountain', 'trekking', 'shortest'];

function toBytes(profile, waypoints) {
  const bytes = [];
  const pushVarint = (n) => {
    // Zickzack-Kodierung für Vorzeichen + Varint
    let z = (n << 1) ^ (n >> 31);
    z = z >>> 0;
    while (z > 0x7f) { bytes.push((z & 0x7f) | 0x80); z >>>= 7; }
    bytes.push(z & 0x7f);
  };
  bytes.push(Math.max(0, PROFILES.indexOf(profile)));
  bytes.push(waypoints.length & 0xff);
  let pLat = 0, pLng = 0;
  for (const w of waypoints) {
    const lat = Math.round(w.lat * 1e5);
    const lng = Math.round(w.lng * 1e5);
    pushVarint(lat - pLat); pushVarint(lng - pLng);
    pLat = lat; pLng = lng;
  }
  return bytes;
}

function fromBytes(bytes) {
  let i = 0;
  const readVarint = () => {
    let shift = 0, result = 0, b;
    do { b = bytes[i++]; result |= (b & 0x7f) << shift; shift += 7; } while (b & 0x80);
    const z = result >>> 0;
    return (z >>> 1) ^ -(z & 1);
  };
  const profile = PROFILES[bytes[i++]] || PROFILES[0];
  const count = bytes[i++];
  const waypoints = [];
  let pLat = 0, pLng = 0;
  for (let k = 0; k < count; k++) {
    pLat += readVarint(); pLng += readVarint();
    waypoints.push({ lat: pLat / 1e5, lng: pLng / 1e5 });
  }
  return { profile, waypoints };
}

function bytesToB64url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlToBytes(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const out = new Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function encodeRoute(profile, waypoints) {
  if (!waypoints || waypoints.length < 2) return '';
  return bytesToB64url(toBytes(profile, waypoints));
}

export function decodeRoute(code) {
  try {
    const { profile, waypoints } = fromBytes(b64urlToBytes(code));
    if (waypoints.length < 2) return null;
    return { profile, waypoints };
  } catch { return null; }
}

export function buildRouteLink(profile, waypoints) {
  const code = encodeRoute(profile, waypoints);
  return `${location.origin}${location.pathname}?route=${code}`;
}
