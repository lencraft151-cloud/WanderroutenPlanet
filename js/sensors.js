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
      heading = ev.webkitCompassHeading; // iOS: bereits Kompasskurs
    } else if (typeof ev.alpha === 'number' && !Number.isNaN(ev.alpha)) {
      heading = 360 - ev.alpha; // Android: alpha ist gegen den Uhrzeigersinn
    }
    if (heading !== null) {
      onHeading(((heading % 360) + 360) % 360);
    }
  };

  // Android liefert absolute Werte nur über deviceorientationabsolute.
  if ('ondeviceorientationabsolute' in window) {
    window.addEventListener('deviceorientationabsolute', handler);
  } else {
    window.addEventListener('deviceorientation', handler);
  }
  compassActive = true;
}

export function compassEnabled() {
  return compassActive;
}
