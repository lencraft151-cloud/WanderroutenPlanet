# 🥾 WanderPlan – Wander-Routenplaner

Eine Web-Plattform zum Planen von Wanderrouten – komplett in HTML, CSS und
Vanilla-JavaScript, ohne Build-Schritt und ohne Frameworks.

## Funktionen

- **Interaktive Karte** (Leaflet) mit umschaltbaren Layern:
  OpenTopoMap (Wanderkarte) und OpenStreetMap
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
- **GPX-Export & -Import**: Routen und Tracks als GPX 1.1 herunterladen oder
  bestehende GPX-Dateien laden (kompatibel mit Garmin, Komoot & Co.)
- **Lokales Speichern**: Routen und Tracks werden im Browser (localStorage)
  verwaltet – Laden, Exportieren, Löschen

## Starten

Die App braucht einen einfachen Webserver (ES-Module funktionieren nicht über
`file://`):

```bash
python3 -m http.server 8000
```

Dann im Browser öffnen: <http://localhost:8000>

## Wichtig: GPS & Kompass brauchen HTTPS

Die Sensor-APIs des Browsers (Geolocation, DeviceOrientation) funktionieren
nur in einem *Secure Context* – also über **HTTPS** oder **localhost**.

- Lokal testen: `http://localhost:8000` reicht aus.
- Auf dem Smartphone nutzen: Die Seite über HTTPS bereitstellen, z. B. mit
  **GitHub Pages** (Repository-Einstellungen → Pages → Branch auswählen).
- Auf iOS muss der Kompass-Zugriff per Tipp auf das Kompass-Symbol bestätigt
  werden (Apple verlangt eine Nutzergeste für Sensor-Berechtigungen).

## Bedienung

| Aktion | So geht's |
| --- | --- |
| Wegpunkt setzen | Auf die Karte tippen |
| Wegpunkt verschieben | Marker ziehen |
| Wegpunkt entfernen | Marker antippen |
| Route umkehren/löschen | Buttons im Tab „Route" |
| Eigene Position | 📍-Button rechts auf der Karte |
| Kompass aktivieren | Kompassrose oben rechts antippen |
| Wanderung aufzeichnen | Tab „Tracking" → „Aufzeichnung starten" |
| Route/Track speichern | 💾-Button; Verwaltung im Tab „Gespeichert" |

## Technik

| Bereich | Lösung |
| --- | --- |
| Karte | [Leaflet 1.9](https://leafletjs.com) via CDN |
| Kacheln | OpenTopoMap, OpenStreetMap |
| Routing | BRouter-HTTP-API (`brouter.de`), GeoJSON inkl. Höhendaten |
| Höhendaten (Fallback) | Open-Meteo Elevation API |
| Sensoren | Geolocation API, DeviceOrientation API |
| Höhenprofil | Eigenes `<canvas>`-Diagramm (`js/elevation.js`) |
| Persistenz | localStorage (`js/storage.js`) |

### Dateistruktur

```
index.html      Oberfläche (Karte, Panel, Kompass, Höhenmesser)
css/style.css   Styles (mobile-first, Desktop-Sidebar ab 900 px)
js/app.js       Verdrahtung von UI und Modulen
js/map.js       Leaflet-Karte, Wegpunkte, Linien, Positionsmarker
js/routing.js   BRouter-Anbindung, Luftlinien-Fallback, Statistik
js/sensors.js   GPS und Kompass
js/tracking.js  Live-Aufzeichnung
js/elevation.js Höhenprofil-Canvas
js/gpx.js       GPX erzeugen/parsen
js/storage.js   localStorage-Verwaltung
```
