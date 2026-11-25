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
  "/background.js", "/og.js", "/registry.js", "/pages.js", "/ns.js", "/bridge.js", "/setup.js", "/real.js", "/a11y.js", "/i18n.js", "/board.js", "/dock.js", "/pop.js", "/limits.js", "/mail.js", "/tour.js", "/mascot.js", "/voice.js", "/hud.js", "/hof3d.js",
  "/real.css", "/kit.css", "/board.css", "/ns.css", "/neo.css", "/og.css", "/dock.css", "/hof3d.css",
  "/vendor/xterm.js", "/vendor/addon-fit.js", "/vendor/xterm.css",
  "/icons/legio.svg", "/icons/icon-192.png", "/icons/icon-512.png",
  "/icons/icon-maskable-512.png", "/icons/apple-touch-icon.png",
  "/caesar/portrait-neo.png",
  "/fonts/caesaros-humanist.woff2", "/fonts/caesaros-mono.woff2", "/fonts/caesaros-imperium.ttf",
  "/fonts/caesar-legio-display.ttf", "/fonts/caesaros-terminal.ttf", "/fonts/caesaros-wordmark.ttf",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("caesaros-atrium-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname === "/sw.js") return; // the worker itself is never cached
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put("/", copy)); return r; }).catch(() => caches.match("/")));
    return;
  }
  // shell files are precached: cache first, then network; anything else fills the cache on first use.
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return r;
  })));
});
