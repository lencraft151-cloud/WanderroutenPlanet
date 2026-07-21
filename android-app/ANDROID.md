# WanderPlan – Android-App

Diese native App ist ein schlanker **WebView-Container**, der die live gehostete
Seite (https://lencraft151-cloud.github.io/Claude/) lädt. Dadurch bekommt die App
bei **jedem Web-Deploy automatisch die neuesten Features** – ohne dass du eine neue
App-Version hochladen musst.

Was die App **zusätzlich** zum Browser kann: **Live-Standort-Teilen im Hintergrund**
(Vordergrund-Dienst + MQTT), also auch bei ausgeschaltetem Bildschirm.

Ein Projekt, **zwei Varianten** (Gradle-Flavors) – gleicher Code:

| Flavor     | Ausgabe | Zweck |
|------------|---------|-------|
| `play`     | **AAB** | Upload in den Google Play Store (Store übernimmt Updates) |
| `sideload` | **APK** | Direkt-Download; App **aktualisiert sich selbst** über GitHub-Releases |

---

## Ordnerübersicht (die „drei Ordner")

1. **Repo-Root** – die gehostete Web-/PWA-Version (Auto-Update via GitHub Pages).
2. **`android-app/`** – dieses Android-Projekt (`play`-AAB + `sideload`-APK).
3. **`apk/`** – Download-Seite (`apk/index.html`), zeigt immer auf die **neueste**
   Sideload-APK: `…/releases/latest/download/WanderPlan-sideload.apk`.

---

## Automatischer Build (empfohlen)

Der Workflow **`.github/workflows/android.yml`** baut beide Varianten in GitHub
Actions und hängt sie an ein Release `android-v<Nummer>` (auch als `latest`).

- **Auslösen:** Actions → „Android Build" → *Run workflow* (oder Push in
  `android-app/**`).
- **Ergebnis:** Ein Release mit `WanderPlan.aab` und `WanderPlan-sideload.apk`.
- **Version:** `versionCode` = Lauf-Nummer, `versionName` = `1.0.<Lauf-Nummer>` →
  jeder Build ist neuer, damit der Selbst-Updater vergleichen kann.

Ohne Signatur-Secrets baut der Workflow trotzdem (Debug-Signatur) – das AAB ist
dann nur **nicht** Play-tauglich. Für den Store brauchst du die Signatur unten.

### Signatur einrichten (für den Play Store)

1. **Keystore erzeugen** (einmalig, gut aufbewahren – verloren = kein Update mehr!):
   ```bash
   keytool -genkeypair -v \
     -keystore wanderplan.keystore \
     -alias wanderplan \
     -keyalg RSA -keysize 2048 -validity 10000
   ```
2. **Base64 kodieren** für das GitHub-Secret:
   ```bash
   base64 -w0 wanderplan.keystore   # macOS: base64 -i wanderplan.keystore
   ```
3. In GitHub → *Settings → Secrets and variables → Actions* anlegen:
   | Secret | Inhalt |
   |--------|--------|
   | `KEYSTORE_BASE64`   | Ausgabe von Schritt 2 |
   | `KEYSTORE_PASSWORD` | Keystore-Passwort |
   | `KEY_ALIAS`         | `wanderplan` |
   | `KEY_PASSWORD`      | Schlüssel-Passwort |
4. Workflow erneut laufen lassen → das AAB ist jetzt signiert.

### In den Play Store hochladen

1. [Play Console](https://play.google.com/console) → App anlegen.
2. Produktion (oder interner Test) → **`WanderPlan.aab`** aus dem Release hochladen.
3. Store-Eintrag, Datenschutz & Inhaltsfreigabe ausfüllen; Standort-Nutzung
   (auch Hintergrund) begründen: *„Live-Standort-Teilen beim Wandern".*
4. Zur Prüfung einreichen.

> Google verlangt für **Hintergrund-Standort** eine kurze Begründung/Video – die
> App nutzt ihn ausschließlich für das vom Nutzer gestartete Live-Teilen.

---

## Lokaler Build (optional)

Voraussetzung: Android SDK + JDK 17. Gradle wird über den Wrapper/CI mit Version
**8.7** genutzt.

```bash
cd android-app
# Sideload-APK (zum direkten Installieren)
gradle :app:assembleSideloadRelease
# Play-AAB
gradle :app:bundlePlayRelease
```

Signatur lokal über Umgebungsvariablen (sonst Debug-Signatur):
`KEYSTORE_FILE`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`.

Ausgaben:
- `app/build/outputs/apk/sideload/release/*.apk`
- `app/build/outputs/bundle/playRelease/*.aab`

---

## Auf dem Gerät testen (was du prüfen solltest)

Der Hintergrund-Dienst lässt sich nur auf einem echten Gerät sinnvoll prüfen:

1. **Sideload-APK installieren** (von der `apk/`-Seite oder aus dem Release).
2. App öffnen → Standort-Berechtigung **„Beim Verwenden der App"** erlauben.
3. Teilen starten → Android fragt nach **„Immer erlauben"** (Hintergrund) und
   Benachrichtigungen → beides erlauben.
4. Bildschirm sperren / App in den Hintergrund → auf einem zweiten Gerät den
   Teil-Link öffnen: der blaue Punkt sollte sich **weiter bewegen**.
5. Persistente Benachrichtigung „WanderPlan teilt deinen Standort" mit
   **Stopp**-Knopf prüfen.
6. **Selbst-Update** (nur Sideload): einen neuen Build veröffentlichen, App neu
   starten → Update-Dialog sollte erscheinen.

---

## Technische Eckdaten

- `applicationId`: `eu.beissert.wanderplan` (Sideload-Suffix `.sideload`, damit
  Store- und Sideload-App parallel installierbar sind).
- `minSdk` 26, `targetSdk`/`compileSdk` 34, Kotlin 1.9.24, AGP 8.5.2, Gradle 8.7.
- **MQTT:** Eclipse Paho, `tcp://broker.emqx.io:1883` (mit Fallback-Brokern) –
  **derselbe** Broker wie im Web (`js/share.js`), damit Web-Betrachter die nativ
  gesendeten Positionen empfangen. Topics/JSON sind identisch:
  - solo: `wanderplan/loc/<token>`
  - Gruppe: `wanderplan/group/<token>/<pid>`
  - Payload: `{lat,lon,acc,alt,speed,heading,ts,name,[color]}` (retained, qos 0).
- **JS↔Native-Brücke:** `window.WanderPlanNative.startShare(json)` / `stopShare()`
  aus `js/app.js`. Im Browser ist `WanderPlanNative` undefiniert → No-op, die
  Web-App bleibt unverändert nutzbar.
