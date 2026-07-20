// Live-Aufzeichnung der Wanderung: Punkte sammeln, Statistik berechnen.

import { haversine } from './routing.js';

const MAX_ACCURACY = 50; // m – ungenauere Positionen werden verworfen
const MIN_DISTANCE = 3;  // m – Stillstand nicht aufzeichnen
const ELE_THRESHOLD = 8; // m – Hysterese für Höhenmeter

let state = 'idle'; // idle | recording | paused | finished
let points = [];
let distance = 0;
let ascent = 0;
let descent = 0;
let eleRef = null;
let startTime = null;
let pausedAt = null;
let pausedTotal = 0;

function reset() {
  points = [];
  distance = 0;
  ascent = 0;
  descent = 0;
  eleRef = null;
  startTime = null;
  pausedAt = null;
  pausedTotal = 0;
}

export function getState() { return state; }

export function start() {
  reset();
  state = 'recording';
  startTime = Date.now();
}

export function pause() {
  if (state !== 'recording') return;
  state = 'paused';
  pausedAt = Date.now();
}

export function resume() {
  if (state !== 'paused') return;
  pausedTotal += Date.now() - pausedAt;
  pausedAt = null;
  state = 'recording';
}

export function stop() {
  if (state === 'paused') {
    pausedTotal += Date.now() - pausedAt;
    pausedAt = null;
  }
  state = 'finished';
}

export function discard() {
  state = 'idle';
  reset();
}

// Verarbeitet eine GPS-Position; gibt true zurück, wenn der Punkt
// aufgezeichnet wurde (dann Track-Linie auf der Karte verlängern).
export function addPosition(pos) {
  if (state !== 'recording') return false;
  const { latitude, longitude, altitude, accuracy } = pos.coords;
  if (accuracy != null && accuracy > MAX_ACCURACY) return false;

  const point = { lat: latitude, lon: longitude, ele: altitude ?? null, time: pos.timestamp || Date.now() };
  const last = points[points.length - 1];
  if (last) {
    const d = haversine(last.lat, last.lon, point.lat, point.lon);
    if (d < MIN_DISTANCE) return false;
    distance += d;
  }
  if (point.ele != null) {
    if (eleRef === null) {
      eleRef = point.ele;
    } else {
      const delta = point.ele - eleRef;
      if (delta >= ELE_THRESHOLD) { ascent += delta; eleRef = point.ele; }
      else if (delta <= -ELE_THRESHOLD) { descent += -delta; eleRef = point.ele; }
    }
  }
  points.push(point);
  return true;
}

export function getStats() {
  let duration = 0;
  if (startTime) {
    const end = state === 'paused' ? pausedAt : Date.now();
    duration = Math.max(0, end - startTime - pausedTotal) / 1000;
  }
  return {
    duration,
    distance,
    ascent: Math.round(ascent),
    descent: Math.round(descent),
    avgSpeed: duration > 0 ? distance / duration : 0, // m/s
    pointCount: points.length,
  };
}

export function getPoints() {
  return points;
}
