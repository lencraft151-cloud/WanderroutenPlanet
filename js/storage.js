// Persistenz gespeicherter Routen und Tracks im localStorage.

const ROUTES_KEY = 'wanderplan.routes';
const TRACKS_KEY = 'wanderplan.tracks';

function load(key) {
  try {
    const raw = localStorage.getItem(key);
    const data = raw ? JSON.parse(raw) : [];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function save(key, items) {
  try {
    localStorage.setItem(key, JSON.stringify(items));
    return true;
  } catch (err) {
    console.error('Speichern fehlgeschlagen:', err);
    return false;
  }
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function listRoutes() { return load(ROUTES_KEY); }
export function listTracks() { return load(TRACKS_KEY); }

// route: { name, waypoints, coords, stats, profile }
export function saveRoute(route) {
  const routes = load(ROUTES_KEY);
  const entry = { id: newId(), createdAt: Date.now(), ...route };
  routes.unshift(entry);
  return save(ROUTES_KEY, routes) ? entry : null;
}

export function deleteRoute(id) {
  save(ROUTES_KEY, load(ROUTES_KEY).filter((r) => r.id !== id));
}

// track: { name, points, stats }
export function saveTrack(track) {
  const tracks = load(TRACKS_KEY);
  const entry = { id: newId(), createdAt: Date.now(), ...track };
  tracks.unshift(entry);
  return save(TRACKS_KEY, tracks) ? entry : null;
}

export function deleteTrack(id) {
  save(TRACKS_KEY, load(TRACKS_KEY).filter((t) => t.id !== id));
}
