// Pairing: two CaesarOS installs meet once with a short code and
// remember each other. This slice is the meeting itself: a code made on one device, entered on the other, and a
// list of who is paired. What a paired device may do (sync of chats and notes) comes next and is not claimed here.
//   - The code exists only while "visible to new devices" is on, lasts 5 minutes, works once, and five wrong tries lock it.
//   - POST /api/pair is the only route a stranger can reach; it needs the code. Everything else is the operator's.
//   - Joining is done by this core talking to the other core (server to server), never by a page calling across origins.
import type { Hono } from "hono";
import { kv } from "./db";
import { hostname } from "node:os";

type Device = { id: string; name: string; at: number; lastSeen: number | null; role: "paired-with-me" | "i-joined"; url?: string; tokenName?: string; token?: string; syncKey?: string };
type State = { visible: boolean; discover: boolean; devices: Device[] };
const store = kv("pairing");
const read = (): State => store.get<State>("state", { visible: false, discover: false, devices: [] });
const write = (s: State) => store.set("state", s);

let current: { code: string; expires: number; fails: number } | null = null;
export const CODE_TTL_MS = 5 * 60_000;
const makeCode = () => String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0]! % 900000));
const thisName = () => (process.env.CAESAROS_DEVICE_NAME ?? hostname()).slice(0, 60);

export function newCode(now = Date.now()): { code: string; expiresAt: number } | { error: "not_visible" } {
  if (!read().visible) return { error: "not_visible" };
  current = { code: makeCode(), expires: now + CODE_TTL_MS, fails: 0 };
  return { code: current.code, expiresAt: current.expires };
}

/** A stranger's attempt. Wrong codes count; the fifth wrong one burns the code. Right code works once. */
export function redeem(code: unknown, name: unknown, now = Date.now(), issue?: (n: string) => string): { ok: true; device: Device; deviceName: string; token?: string; syncKey?: string } | { ok: false; error: "no_code" | "wrong" | "name" } {
  if (!current || current.expires < now || !read().visible) return { ok: false, error: "no_code" };
  const n = typeof name === "string" ? name.trim().slice(0, 60) : "";
  if (!n) return { ok: false, error: "name" };
  if (typeof code !== "string" || code !== current.code) { if (++current.fails >= 5) current = null; return { ok: false, error: "wrong" }; }
  current = null;
  const s = read(); const id = crypto.randomUUID();
  // The new device gets its own key (shown to it once); only the name of it is kept here, the core keeps the hash.
  const tokenName = issue ? `dev-${id.slice(0, 8)}` : undefined;
  const token = issue && tokenName ? issue(tokenName) : undefined;
  // The conversation key is made here, shown to the joining device once, and kept by both; it never goes anywhere else.
  const syncKey = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64");
  const device: Device = { id, name: n, at: now, lastSeen: now, role: "paired-with-me", syncKey, ...(tokenName ? { tokenName } : {}) };
  write({ ...s, devices: [...s.devices, device] });
  return { ok: true, device, deviceName: thisName(), syncKey, ...(token ? { token } : {}) };
}

/** Plain http carries the key in the clear, so it is allowed only where the path is this machine, a home or office network, or a tailnet (encrypted by Tailscale). */
export const plainHttpOk = (host: string): boolean => {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  return h === "localhost" || h === "::1" || h.endsWith(".local") || h.endsWith(".ts.net") || /^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(h);
};
export const cleanUrl = (raw: unknown): string | null => {
  try { const u = new URL(String(raw)); const ok = u.protocol === "https:" || (u.protocol === "http:" && plainHttpOk(u.hostname)); return ok && !u.username && !u.password ? u.origin : null; } catch { return null; }
};

export function pairingApi(app: Hono, isOperator: (c: import("hono").Context) => boolean, fetchImpl: typeof fetch = fetch, opts: { issue?: (n: string) => string } = {}) {
  const guard = (c: import("hono").Context) => (isOperator(c) ? null : c.json({ error: "operator_only" }, 403));
  app.get("/api/pairing", (c) => guard(c) ?? c.json({ ...read(), devices: read().devices.map(({ token: _t, syncKey: _k, ...d }) => ({ ...d, canSend: !!_t, canSyncChats: !!_k })), name: thisName(), codeActive: !!current && current.expires > Date.now() }));
  app.put("/api/pairing", async (c) => {
    const g = guard(c); if (g) return g;
    const b = await c.req.json().catch(() => ({})) as { visible?: unknown; discover?: unknown };
    const s = read(); const next = { ...s, visible: typeof b.visible === "boolean" ? b.visible : s.visible, discover: typeof b.discover === "boolean" ? b.discover : s.discover };
    if (!next.visible) current = null;
    write(next); return c.json(next);
  });
  app.post("/api/pairing/code", (c) => { const g = guard(c); if (g) return g; const r = newCode(); return "error" in r ? c.json(r, 409) : c.json(r); });
  app.delete("/api/pairing/devices/:id", (c) => { const g = guard(c); if (g) return g; const s = read(); const had = s.devices.some((d) => d.id === c.req.param("id")); write({ ...s, devices: s.devices.filter((d) => d.id !== c.req.param("id")) }); return had ? c.json({ ok: true }) : c.json({ error: "not_found" }, 404); });

  // The stranger's door: code-gated, nothing else.
  app.post("/api/pair", async (c) => {
    const b = await c.req.json().catch(() => ({})) as { code?: unknown; name?: unknown };
    const r = redeem(b.code, b.name, Date.now(), opts.issue);
    return r.ok ? c.json({ ok: true, name: r.deviceName, ...(r.syncKey ? { syncKey: r.syncKey } : {}), ...(r.token ? { token: r.token } : {}) }) : c.json({ error: r.error }, r.error === "wrong" ? 403 : 400);
  });

  // This core joins another: it contacts the other core itself.
  app.post("/api/pairing/join", async (c) => {
    const g = guard(c); if (g) return g;
    const b = await c.req.json().catch(() => ({})) as { url?: unknown; code?: unknown };
    const url = cleanUrl(b.url); if (!url) return c.json({ error: "bad_url" }, 400);
    try {
      const r = await fetchImpl(`${url}/api/pair`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: b.code, name: thisName() }), signal: AbortSignal.timeout(6000) });
      const j = await r.json().catch(() => ({})) as { ok?: boolean; name?: string; token?: string; syncKey?: string; error?: string };
      if (!r.ok || !j.ok) return c.json({ error: j.error ?? "refused" }, 400);
      const s = read(); write({ ...s, devices: [...s.devices, { id: crypto.randomUUID(), name: String(j.name ?? url).slice(0, 60), at: Date.now(), lastSeen: Date.now(), role: "i-joined", url, ...(typeof j.token === "string" ? { token: j.token } : {}), ...(typeof j.syncKey === "string" ? { syncKey: j.syncKey } : {}) }] });
      return c.json({ ok: true });
    } catch { return c.json({ error: "unreachable" }, 502); }
  });
}

/** The one thing a paired device may do with its key: leave a task for this device. */
export function deviceByTokenName(name: string | null | undefined): Device | undefined { return name ? read().devices.find((d) => d.tokenName === name) : undefined; }
export const tokenOf = (id: string): { url: string; token: string } | null => { const d = read().devices.find((x) => x.id === id); return d && d.role === "i-joined" && d.url && d.token ? { url: d.url, token: d.token } : null; };
export const pairedCount = () => read().devices.length;
export const touch = (id: string) => { const s = read(); write({ ...s, devices: s.devices.map((d) => (d.id === id ? { ...d, lastSeen: Date.now() } : d)) }); };

/** The conversation key shared with a paired device (base64), or null for a device paired before keys existed. */
export const syncKeyOf = (id: string): string | null => read().devices.find((d) => d.id === id)?.syncKey ?? null;
