// Service Worker nur für den ios/-Ordner.
//
// Zweck: GitHub Pages liefert .mobileconfig mit dem falschen Dateityp
// (application/octet-stream). iOS startet die Profil-Installation aber nur bei
// "application/x-apple-aspen-config". Dieser Worker fängt die Anfrage ab und
// liefert das Profil mit dem korrekten Content-Type aus → das iPhone erkennt es
// als Konfigurationsprofil und bietet die Installation an.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (!url.pathname.endsWith('.mobileconfig')) return;
  event.respondWith(
    fetch(event.request, { cache: 'no-store' })
      .then(async (res) => {
        const buf = await res.arrayBuffer();
        return new Response(buf, {
          status: 200,
          headers: {
            'Content-Type': 'application/x-apple-aspen-config',
            'Content-Disposition': 'attachment; filename="WanderPlan.mobileconfig"',
          },
        });
      })
      .catch(() => fetch(event.request))
  );
});
