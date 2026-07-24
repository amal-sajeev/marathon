// Imported into the workbox-generated service worker via
// VitePWA workbox.importScripts. Handles Web Push messages (from the Cloudflare
// Worker), taps on notifications, and re-subscribing when the browser rotates
// the push subscription (so background check-ins keep working without the app
// being opened).

// --- read config the app stashed in IndexedDB (idb-keyval default store) ---
// The app writes { base, times, random } under "rpgtask:push" and the push URL
// under "rpgtask:pushUrl" so the SW can re-register on its own.
function idbGet(key) {
  return new Promise((resolve) => {
    let db;
    const open = indexedDB.open("keyval-store");
    open.onsuccess = () => {
      db = open.result;
      try {
        const tx = db.transaction("keyval", "readonly");
        const req = tx.objectStore("keyval").get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(undefined);
      } catch (e) {
        resolve(undefined);
      }
    };
    open.onerror = () => resolve(undefined);
    // If the store doesn't exist yet, don't create a broken one.
    open.onupgradeneeded = () => {
      try {
        open.transaction.abort();
      } catch (e) {
        /* ignore */
      }
      resolve(undefined);
    };
  });
}

function urlB64ToUint8Array(base64) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = {};
  }
  const title = data.title || "Leela";
  const body = data.body || "Time for your check-in. Tap to talk.";
  const type = data.type || "checkin";
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag: type === "spontaneous" ? "leela-spontaneous" : "checkin-push",
      renotify: true,
      icon: data.icon || "icons/notify-192.png",
      badge: "icons/badge-72.png",
      data: { type },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const wantsCheckin = data.type === "checkin" || data.type === "spontaneous";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of all) {
        if ("focus" in client) {
          await client.focus();
          if (wantsCheckin) client.postMessage({ type: "run-checkin" });
          return;
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(wantsCheckin ? "./#checkin" : "./");
      }
    })(),
  );
});

// The browser can silently replace a push subscription; when it does we must
// re-subscribe and re-register with the server, or notifications quietly stop.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const cfg = (await idbGet("rpgtask:push")) || {};
      const base = cfg.base || (await idbGet("rpgtask:pushUrl"));
      if (!base) return;

      let appServerKey =
        event.oldSubscription &&
        event.oldSubscription.options &&
        event.oldSubscription.options.applicationServerKey;
      if (!appServerKey) {
        try {
          const res = await fetch(base.replace(/\/+$/, "") + "/vapidPublicKey");
          const { publicKey } = await res.json();
          if (!publicKey) return;
          appServerKey = urlB64ToUint8Array(publicKey);
        } catch (e) {
          return;
        }
      }

      try {
        const sub = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: appServerKey,
        });
        await fetch(base.replace(/\/+$/, "") + "/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subscription: sub.toJSON(),
            times: cfg.times || [],
            random: cfg.random || null,
          }),
        });
      } catch (e) {
        /* best-effort */
      }
    })(),
  );
});
