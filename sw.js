/* UniMate service worker v3: push notifications + offline shell */
const NOTIFY = "https://meavuwntikizkfjhtnbd.supabase.co/functions/v1/notify";
const CACHE = "unimate-shell-v3";

self.addEventListener("install", () => { self.skipWaiting(); });

self.addEventListener("activate", e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE && k.startsWith("unimate")) await caches.delete(k);
  await self.clients.claim();
})()));

// network first, cached copy only when offline (same-origin GET only; API calls are never touched)
self.addEventListener("fetch", e => {
  const r = e.request;
  if (r.method !== "GET") return;
  let u; try { u = new URL(r.url); } catch (_) { return; }
  if (u.origin !== self.location.origin) return;
  e.respondWith((async () => {
    try {
      const res = await fetch(r);
      if (res.ok) { const c = await caches.open(CACHE); c.put(r, res.clone()).catch(() => {}); }
      return res;
    } catch (err) {
      const hit = (await caches.match(r)) || (r.mode === "navigate" ? (await caches.match("./index.html")) || (await caches.match("./")) : null);
      if (hit) return hit;
      throw err;
    }
  })());
});

// The server sends an empty push; the text is fetched here. Every push MUST show a notification,
// so a failed fetch falls back to a generic message instead of silently dropping it.
self.addEventListener("push", e => e.waitUntil((async () => {
  let shown = 0;
  try {
    const sub = await self.registration.pushManager.getSubscription();
    if (sub) {
      const r = await fetch(NOTIFY, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "inbox", endpoint: sub.endpoint }) });
      const j = await r.json();
      for (const it of (j && j.items) || []) {
        await self.registration.showNotification(it.title || "UniMate", {
          body: it.body || "", dir: "rtl", lang: "ar", tag: "unimate-" + Date.now() + "-" + shown, renotify: true,
          vibrate: [120, 60, 120], data: { url: it.url || "./" },
        });
        shown++;
      }
    }
  } catch (_) {}
  if (!shown) await self.registration.showNotification("UniMate", { body: "عندك تنبيه جديد، افتح التطبيق", dir: "rtl", lang: "ar", tag: "unimate-fallback", data: { url: "./" } });
})()));

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "./", self.registration.scope).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of wins) {
      if ("focus" in c) {
        await c.focus();
        if ("navigate" in c) { try { await c.navigate(url); } catch (_) {} }
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});

// lets the app check that this exact version is the one running on the site
self.addEventListener("message", e => { if (e.data === "version" && e.ports && e.ports[0]) e.ports[0].postMessage({ v: "v3" }); });
