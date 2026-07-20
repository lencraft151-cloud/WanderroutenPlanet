// Live-Standort teilen über einen öffentlichen MQTT-Broker (WebSocket-Secure).
//
// Kein eigener Server nötig: Der Sender publisht seine Position als "retained"
// Nachricht auf ein Topic, dessen Zufalls-Token im Teil-Link steckt. Wer den
// Link öffnet, abonniert dasselbe Topic und sieht die Position live.
//
// Hinweis: Öffentliche Broker sind unverschlüsselt gegenüber dem Betreiber –
// der Token-Link ist der einzige Zugriffsschutz. Für gelegentliches privates
// Teilen gedacht, nicht für sensible Daten.

const BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://test.mosquitto.org:8081/',
];

const TOPIC_PREFIX = 'wanderplan/loc/';
const PUBLISH_INTERVAL = 3000; // ms – höchstens alle 3 s senden

// ---------- Token & Link ----------

export function generateToken() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += chars[b % chars.length];
  return out;
}

export function buildShareLink(token) {
  return `${location.origin}${location.pathname}?share=${token}`;
}

function topicFor(token) {
  return TOPIC_PREFIX + token;
}

// ---------- Verbindung mit Broker-Fallback ----------
// Probiert die Broker der Reihe nach durch; der erste erreichbare gewinnt.

function connectWithFallback(onOpen, onStatus) {
  const mqtt = window.mqtt;
  if (!mqtt) {
    onStatus('error', 'Verbindungsbibliothek konnte nicht geladen werden. Bist du online?');
    return () => {};
  }

  let idx = 0;
  let client = null;
  let settled = false;
  let cancelled = false;
  let timer = null;

  function tryNext() {
    if (cancelled) return;
    if (idx >= BROKERS.length) {
      onStatus('error', 'Kein Verbindungsserver erreichbar. Bitte später erneut versuchen.');
      return;
    }
    const url = BROKERS[idx++];
    onStatus('connecting', 'Verbinde mit Server …');
    client = mqtt.connect(url, {
      connectTimeout: 8000,
      reconnectPeriod: 0,
      clean: true,
      keepalive: 30,
    });
    timer = setTimeout(() => {
      if (!settled && !cancelled) {
        try { client.end(true); } catch {}
        tryNext();
      }
    }, 9000);
    client.on('connect', () => {
      if (settled || cancelled) return;
      settled = true;
      clearTimeout(timer);
      onOpen(client);
    });
    const fail = () => {
      if (settled || cancelled) return;
      clearTimeout(timer);
      try { client.end(true); } catch {}
      tryNext();
    };
    client.on('error', fail);
  }

  tryNext();
  return () => {
    cancelled = true;
    clearTimeout(timer);
    if (client) { try { client.end(true); } catch {} }
  };
}

// ---------- Wake Lock (Bildschirm anlassen) ----------

let wakeLock = null;

async function acquireWakeLock() {
  if (!('wakeLock' in navigator)) return false;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
    return true;
  } catch {
    return false;
  }
}

function releaseWakeLock() {
  if (wakeLock) { try { wakeLock.release(); } catch {} wakeLock = null; }
}

// Bildschirm-Sperre nach Zurückkehren erneut anfordern.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && shareState.active && !wakeLock) {
    acquireWakeLock();
  }
});

// ---------- Sender ----------

const shareState = {
  active: false,
  token: null,
  name: '',
  client: null,
  disconnect: null,
  lastPosition: null,
  lastPublish: 0,
  onStatus: null,
};

// Startet das Teilen. onStatus(state, text) mit state ∈
// connecting|live|reconnecting|error. Gibt den Teil-Link zurück.
export function startSharing({ name = '', onStatus = () => {} } = {}) {
  stopSharing({ silent: true });
  const token = generateToken();
  shareState.active = true;
  shareState.token = token;
  shareState.name = name;
  shareState.onStatus = onStatus;
  shareState.lastPublish = 0;

  acquireWakeLock().then((ok) => {
    shareState.wakeLockOk = ok;
  });

  const open = (client) => {
    shareState.client = client;
    onStatus('live', 'Standort wird geteilt.');
    // Zuletzt bekannte Position sofort senden.
    if (shareState.lastPosition) publishNow();
    client.on('close', handleDrop);
    client.on('offline', handleDrop);
  };

  const handleDrop = () => {
    if (!shareState.active || shareState.reconnecting) return;
    shareState.reconnecting = true;
    onStatus('reconnecting', 'Verbindung verloren – neuer Versuch …');
    setTimeout(() => {
      if (!shareState.active) return;
      shareState.reconnecting = false;
      shareState.disconnect = connectWithFallback(open, onStatus);
    }, 3000);
  };

  shareState.disconnect = connectWithFallback(open, onStatus);
  return buildShareLink(token);
}

function publishNow() {
  const c = shareState.client;
  const p = shareState.lastPosition;
  if (!c || !c.connected || !p) return;
  const payload = JSON.stringify({ ...p, name: shareState.name || undefined });
  c.publish(topicFor(shareState.token), payload, { retain: true, qos: 0 });
  shareState.lastPublish = Date.now();
}

// Vom App-Code bei jeder GPS-Position aufgerufen (gedrosselt).
export function publishPosition(pos) {
  if (!shareState.active) return;
  shareState.lastPosition = pos;
  if (Date.now() - shareState.lastPublish >= PUBLISH_INTERVAL) publishNow();
}

export function stopSharing({ silent = false } = {}) {
  if (shareState.disconnect) shareState.disconnect();
  // Retained Nachricht löschen, damit später niemand die alte Position sieht.
  const c = shareState.client;
  if (c && c.connected && shareState.token) {
    try { c.publish(topicFor(shareState.token), '', { retain: true, qos: 0 }); } catch {}
  }
  if (c) { try { c.end(true); } catch {} }
  releaseWakeLock();
  const wasActive = shareState.active;
  shareState.active = false;
  shareState.token = null;
  shareState.client = null;
  shareState.disconnect = null;
  shareState.lastPosition = null;
  shareState.reconnecting = false;
  if (wasActive && !silent && shareState.onStatus) shareState.onStatus('stopped', 'Teilen beendet.');
}

export function isSharing() {
  return shareState.active;
}

export function getShareToken() {
  return shareState.token;
}

// ---------- Empfänger (Viewer) ----------

const viewState = { disconnect: null, client: null };

// Verbindet als Betrachter. onMessage(data) bei jeder Position,
// onStatus(state, text) für Verbindungszustände.
export function startViewing(token, { onMessage = () => {}, onStatus = () => {} } = {}) {
  stopViewing();
  const topic = topicFor(token);

  const open = (client) => {
    viewState.client = client;
    client.subscribe(topic, { qos: 0 }, (err) => {
      if (err) { onStatus('error', 'Konnte nicht abonnieren.'); return; }
      onStatus('waiting', 'Warte auf Standort …');
    });
    client.on('message', (t, payload) => {
      if (t !== topic) return;
      const text = payload.toString();
      if (!text) { onStatus('ended', 'Der Sender hat das Teilen beendet.'); return; }
      try {
        const data = JSON.parse(text);
        if (typeof data.lat === 'number' && typeof data.lon === 'number') {
          onStatus('live', null);
          onMessage(data);
        }
      } catch {
        // fehlerhafte Nachricht ignorieren
      }
    });
    client.on('close', () => onStatus('reconnecting', 'Verbindung unterbrochen …'));
  };

  viewState.disconnect = connectWithFallback(open, onStatus);
}

export function stopViewing() {
  if (viewState.disconnect) viewState.disconnect();
  if (viewState.client) { try { viewState.client.end(true); } catch {} }
  viewState.disconnect = null;
  viewState.client = null;
}
