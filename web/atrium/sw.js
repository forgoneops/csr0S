// CaesarOS Atrium service worker: an offline app shell, nothing more.
// /api/* (live data, the terminal websocket) is never cached; navigations are network-first so the
// page's own failed fetch says the core is unreachable. The cache is named by BUILD, so a new build
// replaces the old shell. shortcut: no background sync or push yet, add when those features exist.
const BUILD = "__BUILD__";
const CACHE = "caesaros-atrium-" + BUILD;
const SHELL = [
  "/",
  "/manifest.webmanifest",
  "/index.html",
  "/ascii-scene.js", "/ascii.js", "/art.js", "/datepick.js", "/skills.js", "/skills.css", "/qr.js", "/gateway.js", "/library.css", "/library.js", "/media.js", "/media.css", "/business.js", "/graph.js", "/live.js", "/live.css", "/lair.css", "/lair.js", "/ideas.js", "/getstarted.js", "/getstarted.css", "/chatx.js", "/storage.js", "/search-palette.js", "/pg-market.js", "/pg-market.css", "/pg-terminal.js", "/pg.css", "/pg-sys.js", "/pg-sys.css", "/pg-schedule.js", "/dialogs.js", "/shortcuts.js", "/conversations.js", "/permissions.js", "/egress.js", "/model-caps.js", "/notify.js", "/brief.js", "/notes-autosave.js", "/chat-meter.js", "/gaps.css", "/toolgraph.css", "/finance.css", "/toolgraph.js", "/finance.js", "/background.js", "/og.js", "/registry.js", "/pages.js", "/ns.js", "/bridge.js", "/setup.js", "/viz.js", "/real.js", "/studio.js", "/studio-logic.js", "/studio.css", "/a11y.js", "/i18n.js", "/board.js", "/dock.js", "/pop.js", "/limits.js", "/mail.js", "/tour.js", "/mascot.js", "/voice.js", "/hud.js", "/hof3d.js", "/hofrelief.js",
  "/real.css", "/kit.css", "/board.css", "/ns.css", "/neo.css", "/theme-pack.css", "/og.css", "/dock.css", "/hof3d.css",
  "/vendor/xterm.js", "/vendor/addon-fit.js", "/vendor/xterm.css", "/vendor/three.min.js",
  "/icons/legio.svg", "/icons/icon-192.png", "/icons/icon-512.png",
  "/icons/icon-maskable-512.png", "/icons/apple-touch-icon.png",
  "/caesar/portrait-neo.png",
  "/fonts/caesaros-humanist.woff2", "/fonts/caesaros-mono.woff2", "/fonts/caesaros-imperium.ttf",
  "/fonts/caesar-legio-display.ttf", "/fonts/caesaros-terminal.ttf", "/fonts/caesaros-wordmark.ttf",
];

self.addEventListener("install", (e) => {
  // The page names its own files (with this build's ?v=), so those are cached too; one missing file never blocks the install.
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    let urls = SHELL;
    try {
      const r = await fetch("/", { cache: "reload" }); const html = await r.clone().text();
      if (r.ok) await c.put("/", r);
      urls = [...new Set([...SHELL, ...[...html.matchAll(/(?:src|href)="([^":#]+\.(?:js|css|webmanifest)\?v=[^"]+)"/g)].map((m) => "/" + m[1])])];
    } catch { /* offline install: the static list only */ }
    await Promise.all(urls.map((u) => c.add(u).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("caesaros-atrium-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// a notice shown through the worker brings the app forward when pressed
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window" }).then((all) => (all[0] ? all[0].focus() : self.clients.openWindow("/"))));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/v1/") || url.pathname === "/sw.js") return; // the worker itself is never cached
  if (req.mode === "navigate") {
    // Only a good copy of the app itself becomes the saved shell. A 401 means this device's access is gone: drop what was saved.
    e.respondWith(fetch(req).then(async (r) => {
      if (r.status === 401) await Promise.all((await caches.keys()).filter((k) => k.startsWith("caesaros-atrium-")).map((k) => caches.delete(k)));
      else if (r.ok && url.pathname === "/") { const copy = r.clone(); caches.open(CACHE).then((c) => c.put("/", copy)); }
      return r;
    }, () => caches.match("/")));
    return;
  }
  // shell files are precached: cache first, then network; anything else fills the cache on first use.
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((r) => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return r;
  })));
});
