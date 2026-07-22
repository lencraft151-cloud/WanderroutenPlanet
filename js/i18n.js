// Zweisprachigkeit Deutsch / Englisch.
//
// Statischer Text im HTML wird über data-i18n / data-i18n-title / data-i18n-ph /
// data-i18n-aria ausgezeichnet und von applyStatic() gesetzt. Dynamische
// Meldungen (Toasts, Status) laufen über t('schlüssel', { var: … }).

const DICT = {
  de: {
    // Kopf / Suche
    'brand.name': 'WanderPlan',
    'search.ph': 'Ort, Berg oder Hütte suchen …',
    'a11y.compass': 'Kompass aktivieren',
    'a11y.theme': 'Hell/Dunkel',
    'a11y.app': 'App herunterladen',
    'a11y.help': 'Hilfe',
    'a11y.lang': 'Sprache: Deutsch/Englisch',
    'a11y.sos': 'SOS / Notfall',
    // Menü
    'menu.android': '🤖 Download Android',
    'menu.ios': '🍎 Download iOS',
    // Tabs
    'tab.route': '🗺 Route', 'tab.tracking': '⏱ Tracking', 'tab.share': '📡 Teilen', 'tab.saved': '📁 Gespeichert',
    // Aktionsleiste
    'act.locate': 'Standort', 'act.record': 'Aufzeichnen', 'act.share': 'Teilen',
    // Route
    'route.hint': '👉 Tippe auf die Karte, um <b>Wegpunkte</b> zu setzen. Die Route wird automatisch über Wanderwege berechnet. Marker <b>ziehen</b> = verschieben, <b>antippen</b> = entfernen. Zwei Finger = Karte <b>neigen/drehen</b> (3D).',
    'route.profile': 'Routing-Profil',
    'profile.hiking': 'Wandern (Gebirge)', 'profile.trekking': 'Trekking / Wege', 'profile.shortest': 'Kürzester Weg',
    'route.autoplan': '🤖 Automatisch planen',
    'route.toTarget': '🎯 Route zum Ziel', 'route.startHere': '📍 Start = ich',
    'loop.5': 'Rundtour ~5 km', 'loop.10': 'Rundtour ~10 km', 'loop.15': 'Rundtour ~15 km', 'loop.20': 'Rundtour ~20 km',
    'loop.make': '🔄 Erzeugen',
    'route.undo': '↩ Rückgängig', 'route.reverse': '⇅ Umkehren', 'route.clear': '✕ Löschen',
    'stat.distance': 'Distanz', 'stat.ascent': 'Anstieg', 'stat.descent': 'Abstieg', 'stat.duration': 'Gehzeit',
    'route.slope': '🎨 Steigung', 'route.flyover': '🎬 Flyover',
    'chart.empty': 'Das Höhenprofil erscheint hier, sobald eine Route berechnet wurde.',
    'route.save': '💾 Speichern', 'route.link': '🔗 Route-Link', 'route.gpx': '⬇ GPX', 'route.import': '⬆ GPX laden',
    // Tracking
    'trk.hint': '⏱ Zeichne deine Wanderung live auf. GPS startet automatisch. Für beste Ergebnisse den <b>Bildschirm anlassen</b>.',
    'trk.duration': 'Dauer', 'trk.distance': 'Distanz', 'trk.avg': 'Ø Tempo', 'trk.speed': 'Tempo', 'trk.ascent': 'Anstieg', 'trk.alt': 'Höhe',
    'trk.start': '● Aufzeichnung starten', 'trk.pause': '⏸ Pause', 'trk.resume': '▶ Weiter', 'trk.stop': '■ Stopp',
    'trk.save': '💾 Speichern', 'trk.export': '⬇ GPX-Export', 'trk.discard': '🗑 Verwerfen',
    // Teilen
    'share.hint': '📡 Teile deinen <b>Live-Standort</b> per Link. Wähle <b>alleine teilen</b> (andere schauen zu) oder eine <b>Gruppe</b> (mehrere Wanderer sehen sich gegenseitig).',
    'share.name': 'Dein Name', 'share.name.ph': 'optional, z. B. Alex',
    'share.solo': '📡 Alleine teilen', 'share.group': '👥 Gruppe starten',
    'share.privacy': '🔒 <b>Datenschutz:</b> Die Positionsdaten laufen über einen kostenlosen öffentlichen Server. Nur wer den Link kennt, sieht die Standorte. Beende das Teilen, wenn du fertig bist.',
    'share.link': 'Dein Teil-Link:', 'share.route': '🗺 Meine geplante Route mitsenden',
    'share.shareBtn': '📤 Link teilen', 'share.stop': '■ Teilen beenden',
    'share.wake': '💡 Solange WanderPlan geöffnet und der Bildschirm an ist, wird dein Standort geteilt. Beim Sperren pausiert es und läuft beim Zurückkehren weiter.',
    'group.link': 'Gruppen-Link (an alle schicken):', 'group.send': '📍 Meinen Standort senden',
    'group.participants': 'Teilnehmer', 'group.leave': '■ Gruppe verlassen',
    // Gespeichert
    'saved.routes': 'Gespeicherte Routen', 'saved.tracks': 'Aufgezeichnete Tracks',
    // Hilfe
    'help.title': '🥾 So funktioniert WanderPlan',
    'help.h1': '🗺 Route planen & 3D-Karte',
    'help.p1': 'Tippe auf die Karte, um Wegpunkte zu setzen – die Route folgt echten Wanderwegen. Mit zwei Fingern <b>neigst und drehst</b> du die 3D-Karte; der ⛰-Button schaltet zwischen 2D und 3D. Distanz, Höhenmeter, Gehzeit und Höhenprofil inklusive.',
    'help.h2': '📍 Standort, 🧭 Kompass & ⛰ Höhe',
    'help.p2': '„Standort" zeigt deine Position. Tippe auf die Kompassrose oben, um den Kompass zu aktivieren (am Handy). Die Höhe kommt vom GPS bzw. aus Geländedaten.',
    'help.h3': '⏱ Aufzeichnen',
    'help.p3': 'Zeichne deine Wanderung live auf: Weg, Distanz, Tempo, Höhenmeter. Danach speichern oder als GPX exportieren.',
    'help.h4': '📡 Teilen & 👥 Gruppe',
    'help.p4': 'Teile deinen Live-Standort per Link – alleine (andere schauen zu, inkl. QR-Code) oder als Gruppe, in der sich mehrere Wanderer gegenseitig live sehen.',
    'help.h5': '🎯 Ankunfts-Alarm',
    'help.p5': 'Beim Verfolgen eines Standorts kannst du mit 🎯 ein Ziel auf der Karte setzen und wirst benachrichtigt, sobald die Person dort ankommt.',
    'help.fine': 'Hinweis: GPS, Kompass & Teilen brauchen HTTPS (oder localhost). Ein Browser kann den Standort nicht dauerhaft im gesperrten Hintergrund senden – dafür bleibt der Bildschirm an.',
    // Betrachter
    'viewer.title': 'Live-Standort', 'viewer.connecting': 'Verbinde …',
    'vw.updated': 'Aktualisiert', 'vw.distance': 'Entfernung', 'vw.speed': 'Tempo', 'vw.alt': 'Höhe',
    'vw.locate': '📍 Meine Position', 'vw.open': '🥾 App öffnen',
    'viewer.note': 'Du siehst den live geteilten Standort. Mit 🎯 (rechts) kannst du ein Ziel setzen und wirst bei Ankunft benachrichtigt.',
    // SOS
    'sos.head': '🆘 Notfall / Standort', 'sos.searching': 'Standort wird gesucht …',
    'sos.share': '📤 Standort senden', 'sos.copy': '📋 Kopieren', 'sos.call': '📞 Notruf 112',
    'sos.note': 'Im Notfall zuerst 112 anrufen. Sende deinen Standort an Begleiter oder die Rettung.',
    // Splash / Fehler
    'splash.sub': '3D-Karte wird geladen …',
    'mapError.title': 'Karte konnte nicht geladen werden', 'mapError.sub': 'Prüfe deine Internetverbindung und lade neu.', 'mapError.reload': '🔄 Neu laden',
    // Toasts
    'toast.updated': '✅ Auf die neue Version aktualisiert.',
    'toast.mapFallback': '🗺 3D-Karte nicht erreichbar – einfache Karte geladen.',
    'toast.locating': 'Standort wird gesucht …',
    'toast.followPaused': 'Folgen pausiert. Tipp erneut oder „Zurück zu mir", um weiterzugehen.',
    'toast.gpsOff': 'Ortung ausgeschaltet.',
    'toast.gpsKept': 'GPS bleibt für Teilen/Tracking aktiv.',
    'toast.noGeo': 'Dein Browser unterstützt keine Standortabfrage.',
    'toast.style': '🗺 Kartenstil: {name}',
    'toast.voiceOn': '🔊 Sprach-Navigation an – Abbiegehinweise werden vorgelesen.',
    'toast.voiceOff': 'Sprach-Navigation aus.',
    'toast.sosNoPos': 'Noch kein Standort – bitte Ortung zulassen.',
    'toast.sosShared': 'Standort kopiert – jetzt einfügen & senden.',
    'toast.coordsCopied': 'Koordinaten kopiert.',
    'toast.linkCopied': 'Link kopiert.',
    'toast.premiumLocked': '⭐ {feature} ist ein Premium-Feature.',
    'toast.premiumOnlyPlay': 'Premium gibt es in der Play-Store-App.',
    'toast.premiumThanks': '⭐ Danke! Premium ist freigeschaltet.',
    // Premium / Upgrade
    'premium.title': '⭐ WanderPlan Premium',
    'premium.sub': 'Schalte coole Extras frei:',
    'premium.f1': '📴 Offline-Karte für unterwegs',
    'premium.f2': '🛰 Satelliten- & Topo-Karten',
    'premium.f3': '♾️ Unbegrenzt Routen & Tracks speichern',
    'premium.f4': '🔊 Premium-Sprachansagen',
    'premium.buy': '⭐ Premium freischalten',
    'premium.restore': 'Kauf wiederherstellen',
    'premium.close': 'Später',
    'premium.onlyPlay': 'In-App-Kauf nur in der Android-App aus dem Play Store.',
  },
  en: {
    'brand.name': 'WanderPlan',
    'search.ph': 'Search place, peak or hut …',
    'a11y.compass': 'Enable compass',
    'a11y.theme': 'Light/Dark',
    'a11y.app': 'Get the app',
    'a11y.help': 'Help',
    'a11y.lang': 'Language: German/English',
    'a11y.sos': 'SOS / Emergency',
    'menu.android': '🤖 Download Android',
    'menu.ios': '🍎 Download iOS',
    'tab.route': '🗺 Route', 'tab.tracking': '⏱ Tracking', 'tab.share': '📡 Share', 'tab.saved': '📁 Saved',
    'act.locate': 'Location', 'act.record': 'Record', 'act.share': 'Share',
    'route.hint': '👉 Tap the map to add <b>waypoints</b>. The route is calculated automatically along trails. <b>Drag</b> a marker to move it, <b>tap</b> to remove it. Two fingers = <b>tilt/rotate</b> the map (3D).',
    'route.profile': 'Routing profile',
    'profile.hiking': 'Hiking (mountain)', 'profile.trekking': 'Trekking / trails', 'profile.shortest': 'Shortest path',
    'route.autoplan': '🤖 Auto-plan',
    'route.toTarget': '🎯 Route to target', 'route.startHere': '📍 Start = me',
    'loop.5': 'Loop ~5 km', 'loop.10': 'Loop ~10 km', 'loop.15': 'Loop ~15 km', 'loop.20': 'Loop ~20 km',
    'loop.make': '🔄 Generate',
    'route.undo': '↩ Undo', 'route.reverse': '⇅ Reverse', 'route.clear': '✕ Clear',
    'stat.distance': 'Distance', 'stat.ascent': 'Ascent', 'stat.descent': 'Descent', 'stat.duration': 'Time',
    'route.slope': '🎨 Slope', 'route.flyover': '🎬 Flyover',
    'chart.empty': 'The elevation profile appears here once a route is calculated.',
    'route.save': '💾 Save', 'route.link': '🔗 Route link', 'route.gpx': '⬇ GPX', 'route.import': '⬆ Load GPX',
    'trk.hint': '⏱ Record your hike live. GPS starts automatically. For best results, <b>keep the screen on</b>.',
    'trk.duration': 'Duration', 'trk.distance': 'Distance', 'trk.avg': 'Avg speed', 'trk.speed': 'Speed', 'trk.ascent': 'Ascent', 'trk.alt': 'Altitude',
    'trk.start': '● Start recording', 'trk.pause': '⏸ Pause', 'trk.resume': '▶ Resume', 'trk.stop': '■ Stop',
    'trk.save': '💾 Save', 'trk.export': '⬇ GPX export', 'trk.discard': '🗑 Discard',
    'share.hint': '📡 Share your <b>live location</b> via link. Choose <b>share solo</b> (others watch) or a <b>group</b> (several hikers see each other).',
    'share.name': 'Your name', 'share.name.ph': 'optional, e.g. Alex',
    'share.solo': '📡 Share solo', 'share.group': '👥 Start group',
    'share.privacy': '🔒 <b>Privacy:</b> Location data goes through a free public server. Only people with the link can see the locations. Stop sharing when you are done.',
    'share.link': 'Your share link:', 'share.route': '🗺 Also send my planned route',
    'share.shareBtn': '📤 Share link', 'share.stop': '■ Stop sharing',
    'share.wake': '💡 As long as WanderPlan is open and the screen is on, your location is shared. Locking pauses it; it resumes when you return.',
    'group.link': 'Group link (send to everyone):', 'group.send': '📍 Send my location',
    'group.participants': 'Participants', 'group.leave': '■ Leave group',
    'saved.routes': 'Saved routes', 'saved.tracks': 'Recorded tracks',
    'help.title': '🥾 How WanderPlan works',
    'help.h1': '🗺 Plan a route & 3D map',
    'help.p1': 'Tap the map to add waypoints – the route follows real trails. Use two fingers to <b>tilt and rotate</b> the 3D map; the ⛰ button toggles 2D/3D. Distance, elevation, time and profile included.',
    'help.h2': '📍 Location, 🧭 compass & ⛰ altitude',
    'help.p2': '“Location” shows your position. Tap the compass rose at the top to enable the compass (on phones). Altitude comes from GPS or terrain data.',
    'help.h3': '⏱ Recording',
    'help.p3': 'Record your hike live: path, distance, speed, elevation. Then save or export as GPX.',
    'help.h4': '📡 Sharing & 👥 group',
    'help.p4': 'Share your live location via link – solo (others watch, incl. QR code) or as a group where several hikers see each other live.',
    'help.h5': '🎯 Arrival alert',
    'help.p5': 'When following a location you can set a target on the map with 🎯 and get notified as soon as the person arrives.',
    'help.fine': 'Note: GPS, compass & sharing need HTTPS (or localhost). A browser cannot keep sending location in the locked background – keep the screen on for that.',
    'viewer.title': 'Live location', 'viewer.connecting': 'Connecting …',
    'vw.updated': 'Updated', 'vw.distance': 'Distance', 'vw.speed': 'Speed', 'vw.alt': 'Altitude',
    'vw.locate': '📍 My position', 'vw.open': '🥾 Open app',
    'viewer.note': 'You are watching the shared live location. Use 🎯 (right) to set a target and get notified on arrival.',
    'sos.head': '🆘 Emergency / Location', 'sos.searching': 'Searching location …',
    'sos.share': '📤 Send location', 'sos.copy': '📋 Copy', 'sos.call': '📞 Emergency 112',
    'sos.note': 'In an emergency call 112 first. Send your location to companions or the rescue service.',
    'splash.sub': 'Loading 3D map …',
    'mapError.title': 'Map could not be loaded', 'mapError.sub': 'Check your internet connection and reload.', 'mapError.reload': '🔄 Reload',
    'toast.updated': '✅ Updated to the new version.',
    'toast.mapFallback': '🗺 3D map unavailable – loaded a simple map.',
    'toast.locating': 'Searching location …',
    'toast.followPaused': 'Following paused. Tap again or “Back to me” to continue.',
    'toast.gpsOff': 'Location turned off.',
    'toast.gpsKept': 'GPS stays on for sharing/tracking.',
    'toast.noGeo': 'Your browser does not support location.',
    'toast.style': '🗺 Map style: {name}',
    'toast.voiceOn': '🔊 Voice navigation on – turn hints are read aloud.',
    'toast.voiceOff': 'Voice navigation off.',
    'toast.sosNoPos': 'No location yet – please allow positioning.',
    'toast.sosShared': 'Location copied – now paste & send.',
    'toast.coordsCopied': 'Coordinates copied.',
    'toast.linkCopied': 'Link copied.',
    'toast.premiumLocked': '⭐ {feature} is a premium feature.',
    'toast.premiumOnlyPlay': 'Premium is available in the Play Store app.',
    'toast.premiumThanks': '⭐ Thanks! Premium is unlocked.',
    'premium.title': '⭐ WanderPlan Premium',
    'premium.sub': 'Unlock cool extras:',
    'premium.f1': '📴 Offline map for the trail',
    'premium.f2': '🛰 Satellite & topo maps',
    'premium.f3': '♾️ Save unlimited routes & tracks',
    'premium.f4': '🔊 Premium voice guidance',
    'premium.buy': '⭐ Unlock premium',
    'premium.restore': 'Restore purchase',
    'premium.close': 'Later',
    'premium.onlyPlay': 'In-app purchase only in the Android app from the Play Store.',
  },
};

let lang = (() => {
  try {
    const s = localStorage.getItem('wanderplan.lang');
    if (s === 'de' || s === 'en') return s;
  } catch { /* egal */ }
  const n = (navigator.language || 'de').toLowerCase();
  return n.startsWith('en') ? 'en' : 'de';
})();

export function getLang() { return lang; }

export function t(key, vars) {
  let s = (DICT[lang] && DICT[lang][key]);
  if (s == null) s = (DICT.de[key] != null ? DICT.de[key] : key);
  if (vars) for (const k in vars) s = s.replace(new RegExp('\\{' + k + '\\}', 'g'), vars[k]);
  return s;
}

export function applyStatic(root) {
  const r = root || document;
  r.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.getAttribute('data-i18n')); });
  r.querySelectorAll('[data-i18n-html]').forEach((el) => { el.innerHTML = t(el.getAttribute('data-i18n-html')); });
  r.querySelectorAll('[data-i18n-title]').forEach((el) => { el.setAttribute('title', t(el.getAttribute('data-i18n-title'))); });
  r.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph'))); });
  r.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria'))); });
}

export function setLang(l) {
  lang = (l === 'en') ? 'en' : 'de';
  try { localStorage.setItem('wanderplan.lang', lang); } catch { /* egal */ }
  document.documentElement.setAttribute('lang', lang);
  applyStatic();
}

export function toggleLang() { setLang(lang === 'de' ? 'en' : 'de'); return lang; }
