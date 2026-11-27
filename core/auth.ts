// An optional password for the person who owns this install (off by default, so nothing changes until it is set).
// Why: on a home network or a tailnet, anyone who can load the page in a browser is treated as the owner. With a
// password set, the page and the API ask for a login first; agents and paired devices keep using their own keys.
// The password is stored only as a salted scrypt hash. Sessions live in memory (a restart logs everyone out).
// Forgot it? Start the core once with CAESAROS_AUTH_RESET=1 and the password is cleared.
import type { Context, Hono, MiddlewareHandler } from "hono";
import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
import { kv } from "./db";
import { access } from "./principal";

type Rec = { salt: string; hash: string } | null;
const store = kv("auth");
if (process.env.CAESAROS_AUTH_RESET === "1") store.delete("rec");
const read = (): Rec => store.get<Rec>("rec", null);
export const authEnabled = (): boolean => read() !== null;

const hashOf = (pw: string, salt: Buffer) => scryptSync(pw, salt, 32).toString("hex");
export const MIN_LEN = 8;

export function setPassword(pw: unknown): "ok" | "short" {
  if (typeof pw !== "string" || pw.length < MIN_LEN || pw.length > 200) return "short";
  const salt = randomBytes(16); store.set("rec", { salt: salt.toString("hex"), hash: hashOf(pw, salt) }); sessions.clear(); return "ok";
}
export function checkPassword(pw: unknown): boolean {
  const r = read(); if (!r || typeof pw !== "string") return false;
  const a = Buffer.from(hashOf(pw, Buffer.from(r.salt, "hex")), "hex"), b = Buffer.from(r.hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
export const clearPassword = () => { store.delete("rec"); sessions.clear(); };

const sessions = new Map<string, number>();
const DAY = 86_400_000;
export function newSession(now = Date.now()): string { const t = randomBytes(24).toString("base64url"); sessions.set(t, now + 30 * DAY); return t; }
export function validSession(t: string | undefined, now = Date.now()): boolean { if (!t) return false; const e = sessions.get(t); if (!e || e < now) { sessions.delete(t ?? ""); return false; } return true; }
const cookieOf = (c: Context) => /(?:^|;\s*)cs=([A-Za-z0-9_-]+)/.exec(c.req.header("cookie") ?? "")?.[1];

// A few wrong tries in a row slow the next ones down, per address, so the password cannot be hammered.
const fails = new Map<string, { n: number; until: number }>();
export function throttled(key: string, now = Date.now()): boolean { const f = fails.get(key); return !!f && f.until > now; }
export function noteFail(key: string, now = Date.now()) { const f = fails.get(key) ?? { n: 0, until: 0 }; f.n++; if (f.n >= 5) { f.until = now + 60_000 * Math.min(30, 2 ** (f.n - 5)); } fails.set(key, f); }
export const noteOk = (key: string) => fails.delete(key);

/** Who is knocking, for the rate limit: the socket's own address. X-Forwarded-For is typed by the caller, so it
 *  counts only when a proxy on this machine sent the request, and then only the last entry, the one the proxy added. */
export function clientAddress(c: Context): string | undefined {
  const ip = (c.env as { server?: { requestIP?: (r: Request) => { address: string } | null } } | undefined)?.server?.requestIP?.(c.req.raw)?.address;
  const via = /^(127\.|::1$|::ffff:127\.)/.test(ip ?? "") ? c.req.header("x-forwarded-for")?.split(",").pop()?.trim() : undefined;
  return via || ip;
}

/** Paths a stranger may always reach: the login page, the status, and the routes that carry their own key. */
const OPEN = [/^\/login$/, /^\/api\/login$/, /^\/api\/auth\/status$/, /^\/api\/health$/, /^\/api\/pair$/, /^\/api\/handoff$/, /^\/api\/sync\/notes$/, /^\/sw\.js$/, /^\/manifest\.webmanifest$/, /^\/icons\//];

export function authGate(): MiddlewareHandler {
  return async (c, next) => {
    if (!authEnabled()) return next();
    const path = c.req.path;
    if (OPEN.some((r) => r.test(path))) return next();
    if (validSession(cookieOf(c))) return next();
    // An agent or a paired device carries its own bearer token. Pass it only when the token is a
    // real issued agent key, not for any header that merely starts with "Bearer " (a bare header
    // would otherwise bypass the login wall on routes that do not re-check the token themselves).
    if (access.principal(c).kind === "agent") return next();
    if (path.startsWith("/api/") || path.startsWith("/v1/")) return c.json({ error: "login_required" }, 401);
    return c.redirect("/login");
  };
}

const PAGE = (msg: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CaesarOS</title>
<style>body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#05060d;color:#e8ecff;font:16px system-ui}form{display:grid;gap:14px;width:min(360px,86vw)}h1{font:600 14px ui-monospace,monospace;letter-spacing:.3em;text-transform:uppercase}
input,button{min-height:44px;box-sizing:border-box;font:inherit;padding:0 14px;color:inherit;background:#0b0d18;border:1px solid #33e8ff55}button{border-color:#ff8a3d;color:#ffb27a;cursor:pointer;letter-spacing:.2em;text-transform:uppercase}p{color:#ff8a8a;min-height:1.2em;margin:0}</style></head>
<body><form method="post" action="/login"><h1>CaesarOS</h1><input type="password" name="password" placeholder="Password" autocomplete="current-password" autofocus><button>Open</button><p role="alert">${msg}</p></form></body></html>`;

export function authApi(app: Hono, isOperator: (c: Context) => boolean) {
  const login = async (c: Context, pw: unknown) => {
    const k = clientAddress(c) ?? "local";
    if (throttled(k)) return { ok: false as const, status: 429 as const };
    if (!authEnabled() || !checkPassword(pw)) { noteFail(k); return { ok: false as const, status: 401 as const }; }
    noteOk(k); return { ok: true as const, token: newSession() };
  };
  const cookie = (t: string) => `cs=${t}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${30 * 86400}`;
  app.get("/login", (c) => c.html(PAGE("")));
  app.post("/login", async (c) => {
    const f = await c.req.parseBody().catch(() => ({} as Record<string, unknown>));
    const r = await login(c, f.password);
    if (!r.ok) return c.html(PAGE(r.status === 429 ? "Too many tries. Wait a minute." : "That is not the password."), r.status);
    c.header("Set-Cookie", cookie(r.token)); return c.redirect("/");
  });
  app.post("/api/login", async (c) => {
    const b = await c.req.json().catch(() => ({})) as { password?: unknown };
    const r = await login(c, b.password);
    if (!r.ok) return c.json({ error: r.status === 429 ? "too_many" : "wrong" }, r.status);
    c.header("Set-Cookie", cookie(r.token)); return c.json({ ok: true });
  });
  app.post("/api/logout", (c) => { c.header("Set-Cookie", "cs=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0"); return c.json({ ok: true }); });
  app.get("/api/auth/status", (c) => c.json({ enabled: authEnabled(), loggedIn: !authEnabled() || validSession(cookieOf(c)) }));
  // Turning it on or changing it: the owner, already inside. Turning it off needs the current password again.
  app.put("/api/auth", async (c) => {
    if (!isOperator(c)) return c.json({ error: "operator_only" }, 403);
    const b = await c.req.json().catch(() => ({})) as { password?: unknown; current?: unknown };
    if (authEnabled() && !checkPassword(b.current)) return c.json({ error: "wrong_current" }, 403);
    return setPassword(b.password) === "ok" ? c.json({ ok: true, enabled: true }) : c.json({ error: "short", min: MIN_LEN }, 400);
  });
  app.delete("/api/auth", async (c) => {
    if (!isOperator(c)) return c.json({ error: "operator_only" }, 403);
    const b = await c.req.json().catch(() => ({})) as { current?: unknown };
    if (!checkPassword(b.current)) return c.json({ error: "wrong_current" }, 403);
    clearPassword(); return c.json({ ok: true, enabled: false });
  });
}
