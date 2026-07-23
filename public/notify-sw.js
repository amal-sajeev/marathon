// Imported into the workbox-generated service worker via
// VitePWA workbox.importScripts. Handles Web Push messages (from the Cloudflare
// Worker) and taps on check-in notifications: focus an existing app window (and
// tell it to run a check-in) or open a new one with a #checkin hash the app
// reads on boot.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = {};
  }
  const title = data.title || "Leela";
  const body = data.body || "Time for your check-in. Tap to talk.";
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag: "checkin-push",
      icon: "icons/icon.svg",
      badge: "icons/icon.svg",
      data: { type: "checkin" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of all) {
        if ("focus" in client) {
          await client.focus();
          client.postMessage({ type: "run-checkin" });
          return;
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow("./#checkin");
      }
    })(),
  );
});
