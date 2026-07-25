// GPS (Geolocation) und Kompass (DeviceOrientation).
// Beides funktioniert nur im Secure Context (HTTPS oder localhost).

// ---------- GPS ----------

let watchId = null;
const positionListeners = new Set();
const errorListeners = new Set();

export function onPosition(fn) { positionListeners.add(fn); }
export function onGPSError(fn) { errorListeners.add(fn); }

export function gpsAvailable() {
  return 'geolocation' in navigator;
}

export function gpsRunning() {
  return watchId !== null;
}

export function startGPS() {
  if (watchId !== null || !gpsAvailable()) return;
  watchId = navigator.geolocation.watchPosition(
    (pos) => positionListeners.forEach((fn) => fn(pos)),
    (err) => errorListeners.forEach((fn) => fn(err)),
    { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 }
  );
}

export function stopGPS() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
}

// ---------- Kompass ----------

let compassActive = false;
let compassTrusted = false; // liefert der Sensor einen ECHTEN Nordbezug?

// Bildschirm-Drehung (Hoch-/Querformat). Ohne diese Korrektur zeigt der Kompass
// im Querformat um 90° falsch – die Sensorwerte beziehen sich immer auf die
// Geräte-Grundausrichtung, nicht auf die gedrehte Anzeige.
function screenAngle() {
  try {
    if (screen.orientation && typeof screen.orientation.angle === 'number') return screen.orientation.angle;
    if (typeof window.orientation === 'number') return window.orientation;
  } catch { /* egal */ }
  return 0;
}

const norm = (d) => ((d % 360) + 360) % 360;

// Kreis-Mittelung (gleitend): Winkel darf man nicht linear mitteln (359°/1°),
// deshalb über Sinus/Kosinus glätten. Dämpft das Zittern des Magnetometers.
let smoothSin = null, smoothCos = null;
const SMOOTH = 0.25; // 0 = träge, 1 = keine Glättung
function smoothHeading(deg) {
  const r = deg * Math.PI / 180;
  const s = Math.sin(r), c = Math.cos(r);
  if (smoothSin === null) { smoothSin = s; smoothCos = c; }
  else { smoothSin += (s - smoothSin) * SMOOTH; smoothCos += (c - smoothCos) * SMOOTH; }
  return norm(Math.atan2(smoothSin, smoothCos) * 180 / Math.PI);
}

// Aktiviert den Kompass; muss aus einer Nutzergeste heraus aufgerufen werden,
// weil iOS die Sensor-Berechtigung nur dann abfragt.
export async function enableCompass(onHeading) {
  if (compassActive) return;

  if (typeof DeviceOrientationEvent !== 'undefined'
      && typeof DeviceOrientationEvent.requestPermission === 'function') {
    const result = await DeviceOrientationEvent.requestPermission();
    if (result !== 'granted') {
      throw new Error('Kompass-Zugriff wurde verweigert.');
    }
  }

  const handler = (ev) => {
    let heading = null;
    if (typeof ev.webkitCompassHeading === 'number' && !Number.isNaN(ev.webkitCompassHeading)) {
      // iOS: bereits echter Kompasskurs (im Uhrzeigersinn ab Norden).
      heading = ev.webkitCompassHeading;
      compassTrusted = true;
    } else if (ev.absolute === true && typeof ev.alpha === 'number' && !Number.isNaN(ev.alpha)) {
      // Android: NUR absolute Werte haben echten Nordbezug. alpha läuft gegen
      // den Uhrzeigersinn → umdrehen.
      heading = 360 - ev.alpha;
      compassTrusted = true;
    } else {
      // Relative Orientierung (kein Nordbezug) → NICHT als Kompass verwenden.
      // Früher wurde das fälschlich als Himmelsrichtung ausgegeben, wodurch die
      // Karte in eine völlig falsche Richtung zeigte.
      return;
    }
    // Bildschirm-Drehung herausrechnen (Querformat!).
    onHeading(smoothHeading(norm(heading + screenAngle())));
  };

  // Android liefert absolute Werte nur über deviceorientationabsolute.
  if ('ondeviceorientationabsolute' in window) {
    window.addEventListener('deviceorientationabsolute', handler);
  }
  // iOS (webkitCompassHeading) kommt über das normale Event – zusätzlich
  // registrieren; nicht-absolute Ereignisse verwirft der Handler oben.
  window.addEventListener('deviceorientation', handler);
  compassActive = true;
}

export function compassEnabled() {
  return compassActive;
}

// Liefert der Sensor eine echte Nordausrichtung? (Sonst: kein Kompass am Gerät.)
export function compassTrustworthy() {
  return compassTrusted;
}
