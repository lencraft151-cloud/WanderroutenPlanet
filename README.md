# 🥾 WanderPlan – Wander-Routenplaner

Eine Web-Plattform zum Planen von Wanderrouten und zum **Live-Teilen des
eigenen Standorts** – komplett in HTML, CSS und Vanilla-JavaScript, ohne
Build-Schritt und ohne Frameworks. Installierbar als App (PWA).

## Funktionen

- **3D-Karte** (MapLibre GL): moderner Vektor-Stil ([OpenFreeMap](https://openfreemap.org),
  kostenlos, kein API-Key) über echtem **3D-Gelände** (Höhenmodell aus
  Terrarium-DEM) mit Hillshade, Himmel und 3D-Gebäuden – frei **neig- und
  drehbar** (zwei Finger), inkl. **2D/3D-Umschalter**. **Hell-/Dunkel-Modus**
  (folgt dem System, umschaltbar) mit passendem dunklen Kartenstil.
- **Eigener Standort als blauer Punkt** (wie in Navi-Apps): Genauigkeitskreis,
  Richtungskegel und Namens-Label, automatisch beim Öffnen aktiviert.
- **🔎 Ortssuche**: Ort, Berg oder Hütte eingeben – die Karte fliegt hin
  (OpenStreetMap-Nominatim).
- **🤖 Automatischer Routenplaner**: Route von deinem Standort zum gesuchten
  oder angetippten Ziel – oder eine **Rundtour** in Wunschlänge.
- **📌 Orte in der Nähe**: Hütten, Gipfel, Wasserquellen, Aussichtspunkte und
  Bänke rund um den Kartenausschnitt (OpenStreetMap-Overpass, keyless) – antippen
  startet die Navigation dorthin.
- **🧭 Ziel-Navigation**: Kompass-Pfeil, der immer zum Ziel zeigt, plus
  Luftlinien-Entfernung und geschätzte Ankunftszeit (ETA).
- **⚠️ Schwierigkeit & Steigung**: grobe SAC-Einstufung (T1–T5) samt maximaler
  Steigung und optionaler farbiger Steigungsanzeige auf der Route (grün = flach,
  rot = steil).
- **🎬 Routen-Flyover**: die geplante Route in 3D abfliegen (animierte
  Kamerafahrt) – perfekt zur Tour-Vorschau.
- **🌦 Wetter & 🌇 Sonnenuntergang** an der Position: aktuelles Wetter und
  „noch X Std bis Sonnenuntergang" mit Warnung bei Dämmerung (Open-Meteo).
- **↩ Zurück zum Start**: Chip mit Richtung und Entfernung zum Startpunkt.
- **Routenplanung auf echten Wanderwegen**: Tippe auf die Karte, um Wegpunkte
  zu setzen – die Route wird über die kostenlose
  [BRouter](https://brouter.de)-API entlang von Wanderwegen berechnet
  (Profile: Wandern/Gebirge, Trekking, kürzester Weg). Ist der Dienst nicht
  erreichbar, wird automatisch die Luftlinie angezeigt.
- **Statistik**: Distanz, Anstieg, Abstieg und Gehzeit nach DAV-Formel
- **Höhenprofil** der Route als interaktives Diagramm (Hover/Touch zeigt den
  Punkt auf der Karte)
- **GPS-Ortung** mit Positionsmarker, Genauigkeitskreis und Folgen-Modus
- **Kompass** mit Kompassrose in der Kopfleiste (Gerätesensor)
- **Höhenmesser**: GPS-Höhe, ersatzweise Geländehöhe via
  [Open-Meteo](https://open-meteo.com)-Elevation-API
- **Live-Tracking**: Wanderung aufzeichnen mit Dauer, Distanz, Tempo und
  Höhenmetern (Start/Pause/Stopp)
- **📡 Live-Standort teilen**: Erzeuge einen Link (inkl. **QR-Code**) – wer ihn
  öffnet, sieht live auf der Karte, wo du gerade bist (Entfernung, Richtung,
  Tempo, Höhe).
- **👥 Gruppen-Wandern**: Ein gemeinsamer Gruppen-Link, unter dem sich mehrere
  Wanderer gegenseitig live auf der Karte sehen (farbige Marker mit Namen,
  Teilnehmerliste, Standort-Senden per Opt-in). Beim Verfolgen zeigt eine
  **Luftlinie mit Abstand** die Verbindung zu deinem eigenen blauen Punkt.
- **🎯 Ankunfts-Alarm**: Beim Verfolgen eines Standorts ein Ziel auf der Karte
  setzen – Benachrichtigung (mit Vibration), sobald die Person dort ankommt.
- **GPX-Export & -Import**: Routen und Tracks als GPX 1.1 herunterladen oder
  bestehende GPX-Dateien laden (kompatibel mit Garmin, Komoot & Co.)
- **Lokales Speichern**: Routen und Tracks werden im Browser (localStorage)
  verwaltet – Laden, Exportieren, Löschen
- **Mobil-optimiert & installierbar**: ziehbares Bottom-Sheet mit Rastpunkten,
  große Touch-Flächen, Hilfe-Overlay und Installation zum Home-Bildschirm (PWA)
  inkl. Offline-Start der App-Oberfläche
- **Feinschliff**: Marken-**Ladebildschirm** bis die 3D-Karte steht, durchgängig
  **dunkle Auswahlfelder** im Dark-Mode, **„×"-Löschknopf** in der Ortssuche,
  saubere Safe-Area-Abstände (wichtig in der Android-App) und
  Button-Druck-Feedback.
- **📱 Als native Android-App** installierbar (Play Store oder direkte APK) mit
  **echtem Standort-Teilen im Hintergrund** – siehe unten.

## Live-Standort teilen

1. Tab **„Teilen"** öffnen, optional einen Namen eingeben, **„Live-Standort
   teilen"** tippen.
2. Den erzeugten **Link** per „Teilen"-Button oder Kopieren an deine
   Begleiter schicken.
3. Wer den Link öffnet, landet automatisch im **Betrachter-Modus** und sieht
   deine Position live auf der Karte.

So funktioniert es technisch: Die Positionen laufen über einen kostenlosen,
öffentlichen **MQTT-Broker** (WebSocket) – kein eigener Server, kein Konto
nötig. Der Link enthält einen langen Zufalls-Token; nur wer den Link hat,
sieht den Standort.

> **🔒 Datenschutz:** Der Broker ist öffentlich – gedacht für gelegentliches
> privates Teilen, nicht für sensible Daten. Beende das Teilen, wenn du fertig
> bist (die letzte Position wird dann vom Broker gelöscht).

### „Läuft im Hintergrund?"

Ein Web-Browser kann – anders als eine native App – den Standort **nicht
dauerhaft bei gesperrtem Bildschirm** senden. WanderPlan holt das Maximum
heraus:

- **Wake Lock**: Solange die App offen ist, bleibt der Bildschirm an und der
  Standort wird zuverlässig gesendet.
- Beim Sperren/Wegschalten **pausiert** das Teilen und läuft beim Zurückkehren
  automatisch weiter.
- **Installiert** (Zum Home-Bildschirm) läuft es am stabilsten.

Für **echtes Teilen im Hintergrund** (Bildschirm aus) gibt es die native
**Android-App** – siehe unten.

## 📱 Android-App

Es gibt WanderPlan auch als native **Android-App**. Sie lädt dieselbe live
gehostete Seite (bekommt also automatisch jedes Web-Update) und kann
**zusätzlich den Live-Standort echt im Hintergrund teilen** – über einen
Vordergrund-Dienst, auch bei gesperrtem Bildschirm.

- **Google Play**: signiertes **AAB** (`play`-Variante) – der Store übernimmt
  Updates.
- **Direkt-Download**: **APK** (`sideload`-Variante), die sich über
  GitHub-Releases **selbst aktualisiert**. Download-Seite: [`apk/`](apk/) →
  immer die neueste APK (`…/releases/latest/download/WanderPlan-sideload.apk`).

Das Projekt liegt in [`android-app/`](android-app/); Bauen, Signieren und
Play-Upload sind in [`android-app/ANDROID.md`](android-app/ANDROID.md)
beschrieben. Gebaut wird automatisch per GitHub Actions
(`.github/workflows/android.yml`).

> Die App teilt den Standort ausschließlich für das vom Nutzer gestartete
> Live-Teilen und nutzt denselben MQTT-Broker/dieselben Topics wie das Web –
> Web-Betrachter sehen die nativ gesendeten Positionen unverändert.

## Starten (lokal)

Die App braucht einen einfachen Webserver (ES-Module funktionieren nicht über
`file://`):

```bash
python3 -m http.server 8000
```

Dann im Browser öffnen: <http://localhost:8000>

## Wichtig: GPS, Kompass & Teilen brauchen HTTPS

Die Sensor-APIs des Browsers (Geolocation, DeviceOrientation, Wake Lock)
funktionieren nur in einem *Secure Context* – also über **HTTPS** oder
**localhost**.

- Lokal testen: `http://localhost:8000` reicht aus.
- Auf dem Smartphone nutzen: Die Seite über HTTPS bereitstellen, z. B. mit
  **GitHub Pages** (Repository-Einstellungen → Pages → Source „GitHub
  Actions"). Diese Repo enthält dafür bereits einen Workflow.
- Auf iOS muss der Kompass-Zugriff per Tipp auf das Kompass-Symbol bestätigt
  werden (Apple verlangt eine Nutzergeste für Sensor-Berechtigungen).

## Bedienung

| Aktion | So geht's |
| --- | --- |
| Wegpunkt setzen | Auf die Karte tippen |
| Wegpunkt verschieben / entfernen | Marker ziehen / antippen |
| Panel vergrößern | Griff oben am Panel ziehen oder antippen (3 Größen) |
| Eigene Position | „Standort" in der Aktionsleiste oder 📍 auf der Karte |
| Kompass aktivieren | Kompassrose oben rechts antippen |
| 2D/3D umschalten | ⛰-Button rechts auf der Karte; zwei Finger = neigen/drehen |
| Wanderung aufzeichnen | „Aufzeichnen" → „Aufzeichnung starten" |
| Live-Standort teilen | „Teilen" → „Alleine teilen" bzw. „Gruppe starten" → Link/QR senden |
| Ankunfts-Alarm | Beim Verfolgen: 🎯-Button → Ziel auf der Karte antippen |
| Hilfe | ❓ oben rechts |

## Technik

| Bereich | Lösung |
| --- | --- |
| Karte | [MapLibre GL JS](https://maplibre.org) (WebGL, 3D) via CDN |
| Kartenstil | [OpenFreeMap](https://openfreemap.org) „liberty" (Vektor, keyless) |
| 3D-Gelände | Terrarium-DEM ([Terrain Tiles](https://registry.opendata.aws/terrain-tiles/), keyless) + Hillshade |
| Routing | BRouter-HTTP-API (`brouter.de`), GeoJSON inkl. Höhendaten |
| Höhendaten (Fallback) | Open-Meteo Elevation API |
| Standort teilen / Gruppe | MQTT über WebSocket ([MQTT.js](https://github.com/mqttjs/MQTT.js), öffentliche Broker mit Fallback) |
| Ortssuche | OpenStreetMap-Nominatim (keyless) |
| Wetter & Sonnenzeiten | [Open-Meteo](https://open-meteo.com) Forecast (keyless) |
| QR-Code | [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) (offline) |
| Sensoren / Alarm | Geolocation, DeviceOrientation, Screen Wake Lock, Notification, Vibration |
| Höhenprofil | Eigenes `<canvas>`-Diagramm (`js/elevation.js`) |
| Persistenz | localStorage (`js/storage.js`) |
| App/Offline | Web-App-Manifest + Service Worker (`sw.js`) |

### Dateistruktur

```
index.html            Oberfläche (Karte, Bottom-Sheet, Betrachter-Karte, Hilfe)
manifest.webmanifest  PWA-Manifest
sw.js                 Service Worker (App-Shell-Cache, Offline-Start)
icons/                App-Icons
css/style.css         Styles (mobile-first, Desktop-Sidebar ab 900 px)
js/app.js             Verdrahtung von UI und Modulen, Bottom-Sheet, Betrachter, Gruppe, Ziel
js/map.js             MapLibre-3D-Karte (Gelände/Gebäude), Marker, Linien, Peers, Ziel
js/routing.js         BRouter-Anbindung, Luftlinien-Fallback, Statistik
js/sensors.js         GPS und Kompass
js/tracking.js        Live-Aufzeichnung
js/elevation.js       Höhenprofil-Canvas
js/gpx.js             GPX erzeugen/parsen
js/storage.js         localStorage-Verwaltung
js/search.js          Ortssuche (Nominatim)
js/poi.js             Orte in der Nähe (Overpass)
js/difficulty.js      SAC-Schwierigkeit & Steigungsanalyse
js/weather.js         Wetter & Sonnenzeiten (Open-Meteo)
js/share.js           Live-Standort teilen (MQTT, Token/Link, Wake Lock)

apk/index.html        Download-Seite für die Android-APK (immer neueste Version)
android-app/          Native Android-App (WebView + Hintergrund-Standort)
  app/…/MainActivity.kt        Vollbild-WebView, Berechtigungen, JS-Brücke
  app/…/LocationShareService.kt Vordergrund-Dienst: Standort → MQTT
  app/…/Mqtt.kt                 Paho-MQTT (gleicher Broker wie Web)
  app/…/UpdateChecker.kt        Sideload-Selbst-Update (Play: No-op)
  ANDROID.md                    Bauen, Signieren, Play-Upload, Gerätetest
.github/workflows/android.yml   CI: baut AAB + Sideload-APK, Release
```
