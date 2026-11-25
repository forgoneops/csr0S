// CaesarOS service worker: an offline app shell, nothing more.
// Rules: /api/* and /packs/* are never cached here (live data and pack files stay with the server);
// navigations are network-first and fall back to the cached shell, so the app opens offline and its
// own screens say honestly which gateway is unreachable. The cache is named by BUILD so a new build
// replaces the old shell. shortcut: no background sync or push yet, add with S7 push step.
const BUILD = "__BUILD__";
const CACHE = "caesaros-shell-" + BUILD;
const SHELL = ["/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/mark.svg", "/icons/apple-touch-icon.png"];

// The first visit loads its scripts before this worker controls the page, so the hashed files in
// /assets/ would never be cached. Read the shell and cache the assets it names, or offline shows nothing.
async function precache() {
  const c = await caches.open(CACHE);
  await c.addAll(SHELL);
  const html = await (await c.match("/")).text();
  const assets = [...new Set(html.match(/\/assets\/[^"'<>\s]+/g) || [])];
  await c.addAll(assets);
}

self.addEventListener("install", (e) => {
  e.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("caesaros-shell-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/packs/")) return;
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then((r) => { caches.open(CACHE).then((c) => c.put("/", r.clone())); return r; }).catch(() => caches.match("/")));
    return;
  }
  // built assets are content-hashed: cache first, fill on miss
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => {
    if (r.ok && url.pathname.startsWith("/assets/")) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return r;
  })));
});
