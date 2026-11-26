// Serve as web app: the same running app, opened from another browser, phone or tablet.
// Native first: by default nothing listens beyond this machine's loopback. The person can raise the reach to
// "lan" (the private network address of this machine) or "tailnet" (its Tailscale address). That starts a SECOND
// listener bound to that one address only (never 0.0.0.0, never a public interface), on the same port as the
// loopback one, so a URL is just http://<address>:<port>. The second listener carries a flag in the request
// environment, and every request that arrives on it, or from a non-loopback peer on any listener, must present the
// access token: no default-open, no CORS headers. The token is shown once (only its hash is kept), can be rotated,
// and is revoked by stopping. Wrong tokens are rate limited per peer address with the same throttle as the password.
//   - A browser opens  <url>/?gt=<token>  once: the core sets an HttpOnly cookie and redirects to a clean URL.
//   - A tool sends     Authorization: Bearer <token>.
//   - Loopback callers (the native shell, this machine's browser, in-process tests) are never asked.
// shortcut: plain http, the token travels in the clear on the chosen network. Fine on a home LAN and on a tailnet
// (Tailscale encrypts it); for anything else put https in front (for example tailscale serve) and keep reach on "device".
import type { Context, Hono, MiddlewareHandler } from "hono";
import { networkInterfaces } from "node:os";
import { timingSafeEqual } from "node:crypto";
import { throttled, noteFail, noteOk } from "./auth";

export type Reach = "device" | "lan" | "tailnet";
type Rec = { reach: Reach; hash: string | null };
type Store = { get<T>(k: string, d: T): T; set(k: string, v: unknown): void };
type Addrs = { lan: string | null; tailnet: string | null };
type Device = { ip: string; name: string; first: number; last: number };
type Env = { server?: { requestIP?: (r: Request) => { address: string } | null }; gw?: boolean };

const sha = (s: string) => new Bun.CryptoHasher("sha256").update(s).digest("hex");
const LOOP = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const PUBLIC = /^\/(api\/health|sw\.js|manifest\.webmanifest|icons\/.*)$/;   // what a browser fetches without credentials, or that names nothing private
const cookieOf = (c: Context) => /(?:^|;\s*)cg=([A-Za-z0-9_-]+)/.exec(c.req.header("cookie") ?? "")?.[1];
const bearerOf = (c: Context) => { const h = c.req.header("authorization") ?? ""; return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : undefined; };
const peerOf = (c: Context) => (c.env as Env | undefined)?.server?.requestIP?.(c.req.raw)?.address;

/** True for a caller on this machine: the native shell, the local browser, in-process tests. False on the gateway listener. */
export const isLocal = (c: Context): boolean => { if ((c.env as Env | undefined)?.gw) return false; const p = peerOf(c); return !p || LOOP.has(p); };

/** This machine's private LAN and Tailscale IPv4 addresses, read from the interfaces (no command is run). */
export function localAddresses(): Addrs {
  const out: Addrs = { lan: null, tailnet: null };
  for (const list of Object.values(networkInterfaces())) for (const i of list ?? []) {
    if (i.family !== "IPv4" || i.internal) continue;
    const [a, b] = i.address.split(".").map(Number);
    if (a === 100 && b! >= 64 && b! <= 127) out.tailnet ??= i.address;
    else if (a === 10 || (a === 192 && b === 168) || (a === 172 && b! >= 16 && b! <= 31)) out.lan ??= i.address;
  }
  return out;
}

const uaName = (ua: string) => `${/iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "Device"} ${/Firefox/.test(ua) ? "Firefox" : /Edg\//.test(ua) ? "Edge" : /Chrome/.test(ua) ? "Chrome" : /Safari/.test(ua) ? "Safari" : "browser"}`;

export type WebGateOpts = { store: Store; port: number; fetch: (req: Request, env: Env) => Response | Promise<Response>; addrs?: () => Addrs; serve?: typeof Bun.serve };

export function createWebGate(o: WebGateOpts) {
  const addrs = o.addrs ?? localAddresses, serve = o.serve ?? Bun.serve;
  const rec = (): Rec => o.store.get<Rec>("rec", { reach: "device", hash: null });
  const devices = new Map<string, Device>();
  let server: ReturnType<typeof Bun.serve> | null = null, listenOn: string | null = null, error: string | null = null;

  const mint = (): string => { const t = `cgw_${Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64url")}`; o.store.set("rec", { ...rec(), hash: sha(t) }); devices.clear(); return t; };
  const valid = (t: string | undefined): boolean => {
    const h = rec().hash; if (!t || !h || t.length > 80) return false;
    const a = Buffer.from(sha(t)), b = Buffer.from(h); return a.length === b.length && timingSafeEqual(a, b);
  };
  const baseUrl = () => (listenOn ? `http://${listenOn}:${o.port}` : null);
  const close = () => { try { server?.stop(true); } catch { /* already closed */ } server = null; listenOn = null; };

  function open(reach: Reach): boolean {
    close(); error = null;
    if (reach === "device") return true;
    const host = addrs()[reach];
    if (!host) { error = "no_address"; return false; }
    try {
      server = serve({ hostname: host, port: o.port, idleTimeout: 0, fetch: (req, srv) => o.fetch(req, { gw: true, server: srv }) });
      listenOn = host;
    } catch { error = "bind_failed"; server = null; return false; }
    return true;
  }

  /** Change who may reach the app. Any level above "device" mints a fresh token (old links stop working) and returns it once. */
  function setReach(reach: Reach): { token?: string } {
    if (reach === "device") { close(); o.store.set("rec", { reach, hash: null }); devices.clear(); error = null; return {}; }
    o.store.set("rec", { reach, hash: null });
    const token = mint();
    if (!open(reach)) { o.store.set("rec", { reach: "device", hash: null }); return {}; }
    return { token };
  }
  const rotate = (): { token?: string } => (rec().reach === "device" || !server ? {} : { token: mint() });
  /** At boot: keep what the person chose last time. Without a stored hash nothing opens. */
  const restore = () => { const r = rec(); if (r.reach !== "device" && r.hash) open(r.reach); };

  const status = () => ({
    reach: rec().reach, listening: !!server, port: o.port, url: baseUrl(), address: addrs(), hasToken: !!rec().hash, error,
    devices: [...devices.values()].sort((a, b) => b.last - a.last).map((d) => ({ ip: d.ip, name: d.name, firstSeen: d.first, lastSeen: d.last })),
  });

  /** First middleware: a caller that is not on this machine proves the token or gets nothing. */
  const gate = (): MiddlewareHandler => async (c, next) => {
    if (isLocal(c)) return next();
    const url = new URL(c.req.url), path = url.pathname;
    if (PUBLIC.test(path)) return next();
    const key = peerOf(c) ?? "gateway";
    if (throttled(key)) return c.json({ error: "too_many" }, 429);
    const q = url.searchParams.get("gt") ?? undefined, t = q ?? bearerOf(c) ?? cookieOf(c);
    if (valid(t)) {
      noteOk(key);
      const ua = c.req.header("user-agent") ?? "", now = Date.now(), id = `${key}|${ua}`, d = devices.get(id);
      if (d) d.last = now; else if (devices.size < 50) devices.set(id, { ip: key, name: uaName(ua), first: now, last: now });
      if (q) {
        url.searchParams.delete("gt");
        c.header("Set-Cookie", `cg=${q}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${30 * 86400}`);
        return c.redirect(url.pathname + url.search);
      }
      return next();
    }
    if (t) noteFail(key);
    if (path.startsWith("/api/") || path.startsWith("/v1/")) return c.json({ error: "gateway_token_required" }, 401);
    return c.html(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CaesarOS</title><body style="margin:0;min-height:100dvh;display:grid;place-items:center;background:#05060d;color:#e8ecff;font:16px system-ui"><p style="max-width:22em;text-align:center">This CaesarOS needs its link. Open the full link (or scan the QR code) from the Gateway page on the computer that runs it.</p>`, 401);
  };

  /** Control routes: only this machine's own browser may change who can reach the app. */
  function routes(app: Hono, isOperator: (c: Context) => boolean) {
    const guard = (c: Context) => (!isLocal(c) ? c.json({ error: "loopback_only" }, 403) : !isOperator(c) ? c.json({ error: "operator_only" }, 403) : null);
    const link = (token?: string) => (token && baseUrl() ? { token, link: `${baseUrl()}/?gt=${token}` } : {});
    app.get("/api/webgate", (c) => guard(c) ?? c.json(status()));
    app.put("/api/webgate", async (c) => {
      const g = guard(c); if (g) return g;
      const b = await c.req.json().catch(() => ({})) as { reach?: unknown };
      if (b.reach !== "device" && b.reach !== "lan" && b.reach !== "tailnet") return c.json({ error: "reach_invalid" }, 400);
      const r = setReach(b.reach);
      return c.json({ ...status(), ...link(r.token) }, error ? 409 : 200);
    });
    app.post("/api/webgate/rotate", (c) => guard(c) ?? c.json({ ...status(), ...link(rotate().token) }));
    app.delete("/api/webgate", (c) => guard(c) ?? (setReach("device"), c.json(status())));
  }

  return { gate, routes, status, setReach, rotate, restore, stop: () => setReach("device"), valid };
}
