// Gateway registry (R44): the places this install may talk to, each added by the person. "This device"
// is implicit and never stored. A probe goes only to a gateway in the list (R44 rule 5: no hidden egress),
// never follows a redirect, and is bounded in time and size.
import type { Context, Hono } from "hono";
import { chmodSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { Settings } from "./schema";
import { plainHttpOk } from "./pairing";
import { isLocal } from "./webgate";

export type Gateway = Settings["gateways"][number];
export type Health = { id: string; ok: boolean; status: number | null; latencyMs: number | null; version: string | null; error: string | null };

const MAX_BODY = 64 * 1024;
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** http(s) only, no credentials, no fragment, no query; trailing slash dropped. Returns the clean URL or an error key. */
export function cleanUrl(raw: unknown): { url: string } | { error: string } {
  if (typeof raw !== "string" || !raw.trim()) return { error: "url_required" };
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return { error: "url_invalid" }; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return { error: "url_scheme" };
  if (u.username || u.password) return { error: "url_credentials" };
  if (u.search || u.hash) return { error: "url_extras" };
  return { url: (u.origin + u.pathname).replace(/\/+$/, "") };
}

export const slug = (name: string): string => {
  const s = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return /^[a-z]/.test(s) ? s.slice(0, 40) : `gw-${s}`.slice(0, 40);
};

/** Pure: the list after adding one. The id is unique; the cap (8) is the schema's. */
export function addGateway(list: Gateway[], input: { name?: unknown; url?: unknown; kind?: unknown; token?: unknown }): { list: Gateway[] } | { error: string } {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) return { error: "name_required" };
  if (name.length > 60) return { error: "name_long" };
  if (name.toLowerCase() === "this device") return { error: "name_reserved" };   // the local entry is always there and is not stored
  if (list.some((g) => g.name.toLowerCase() === name.toLowerCase())) return { error: "name_duplicate" };
  const c = cleanUrl(input.url);
  if ("error" in c) return c;
  if (c.url.startsWith("http:") && !plainHttpOk(new URL(c.url).hostname)) return { error: "url_plain_http" };   // the token would cross the open internet
  if (input.token !== undefined && !validToken(input.token)) return { error: "token_invalid" };
  if (list.some((g) => g.url === c.url)) return { error: "url_duplicate" };
  if (list.length >= 8) return { error: "too_many" };
  let id = slug(name) || "gateway";
  for (let n = 2; list.some((g) => g.id === id); n++) id = `${slug(name)}-${n}`.slice(0, 44);
  const host = new URL(c.url).hostname;
  const kind: Gateway["kind"] = input.kind === "local" || input.kind === "vps" ? input.kind : LOOPBACK.has(host) ? "local" : "vps";
  return { list: [...list, { id, name, url: c.url, kind }] };
}

/** The same rules for a whole list: the settings route can replace the list without going through POST. Returns the first problem. */
export function registryProblem(list: Gateway[]): string | null {
  let ok: Gateway[] = [];
  for (const g of list) {
    if (ok.some((x) => x.id === g.id) || g.id === "this-device") return "id_duplicate";
    const r = addGateway(ok, { name: g.name, url: g.url });
    if ("error" in r) return r.error;
    ok = [...ok, { ...g, url: r.list[r.list.length - 1]!.url }];
  }
  return null;
}

export const validToken = (t: unknown): t is string => typeof t === "string" && /^[\x21-\x7e]{8,200}$/.test(t);

/** Remote tokens: one 0600 file under the data folder, written atomically, never part of an API answer or a backup of settings. */
export function secretStore(path: string) {
  const read = (): Record<string, string> => { try { return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {}; } catch { return {}; } };
  const write = (m: Record<string, string>) => { const tmp = `${path}.tmp`; writeFileSync(tmp, JSON.stringify(m), { mode: 0o600 }); chmodSync(tmp, 0o600); renameSync(tmp, path); };
  return {
    get: (id: string): string | null => read()[id] ?? null,
    has: (id: string): boolean => id in read(),
    set: (id: string, token: string) => write({ ...read(), [id]: token }),
    del: (id: string) => { const m = read(); if (id in m) { delete m[id]; write(m); } },
  };
}

export const removeGateway = (list: Gateway[], id: string): Gateway[] => list.filter((g) => g.id !== id);

/** The body as text, or null if it is longer than `max` bytes. Reads chunk by chunk and stops at the cap, so a server
 *  that streams without a Content-Length cannot make the core buffer more than `max`. */
async function readCapped(r: Response, max: number): Promise<string | null> {
  if (!r.body) return "";
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let n = 0, out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return out + dec.decode();
    n += value.byteLength;
    if (n > max) { await reader.cancel().catch(() => {}); return null; }
    out += dec.decode(value, { stream: true });
  }
}

/** One bounded probe of GET <url>/api/health. `doFetch` is injected so tests never touch a network. */
export async function probe(g: Gateway, doFetch: typeof fetch = fetch, timeoutMs = 2500): Promise<Health> {
  const t0 = performance.now();
  const base = { id: g.id, ok: false, status: null as number | null, latencyMs: null as number | null, version: null as string | null };
  try {
    const r = await doFetch(`${g.url}/api/health`, { redirect: "manual", signal: AbortSignal.timeout(timeoutMs), headers: { accept: "application/json" } });
    const ms = Math.round(performance.now() - t0);
    if (r.status >= 300 && r.status < 400) return { ...base, status: r.status, latencyMs: ms, error: "redirect_refused" };
    if (!r.ok) return { ...base, status: r.status, latencyMs: ms, error: `http_${r.status}` };
    if (Number(r.headers.get("content-length") ?? 0) > MAX_BODY) return { ...base, status: r.status, latencyMs: ms, error: "too_large" };
    const text = await readCapped(r, MAX_BODY);
    if (text === null) return { ...base, status: r.status, latencyMs: ms, error: "too_large" };
    let body: { ok?: unknown; name?: unknown; version?: unknown } = {};
    try { body = JSON.parse(text); } catch { return { ...base, status: r.status, latencyMs: ms, error: "not_caesaros" }; }
    if (body.ok !== true || body.name !== "CaesarOS") return { ...base, status: r.status, latencyMs: ms, error: "not_caesaros" };
    return { ...base, ok: true, status: r.status, latencyMs: ms, version: typeof body.version === "string" ? body.version.slice(0, 40) : null, error: null };
  } catch (e) {
    const name = (e as Error).name;
    return { ...base, error: name === "TimeoutError" || name === "AbortError" ? "timeout" : "unreachable" };
  }
}

type Io = { read: () => Settings; save: (next: Settings) => void; version: string; doFetch?: typeof fetch; secrets?: ReturnType<typeof secretStore>; isOperator?: (c: Context) => boolean };

export function gatewayRoutes(app: Hono, io: Io): void {
  const sec = io.secrets;
  const pub = (g: Gateway) => ({ ...g, hasToken: !!sec?.has(g.id) });   // the token itself never leaves the core's answer
  app.get("/api/gateways", (c) => c.json({
    thisDevice: { id: "this-device", name: "This device", version: io.version },
    gateways: io.read().gateways.map(pub),
  }));

  app.post("/api/gateways", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const s = io.read();
    const r = addGateway(s.gateways, body as object);
    if ("error" in r) return c.json({ error: r.error }, 400);
    const next = Settings.parse({ ...s, gateways: r.list });
    io.save(next);
    const made = next.gateways[next.gateways.length - 1]!;
    if (sec && validToken((body as { token?: unknown }).token)) sec.set(made.id, (body as { token: string }).token);
    return c.json(pub(made), 201);
  });

  app.put("/api/gateways/:id/token", async (c) => {
    const id = c.req.param("id");
    if (!io.read().gateways.some((g) => g.id === id)) return c.json({ error: "not_found" }, 404);
    const b = await c.req.json().catch(() => ({})) as { token?: unknown };
    if (!sec || !validToken(b.token)) return c.json({ error: "token_invalid" }, 400);
    sec.set(id, b.token);
    return c.json({ ok: true, hasToken: true });
  });

  // Switch to a remote gateway: the browser is sent to its address with the token for the one-time handshake.
  // The token goes only to the address the person added, in a redirect header, never in a JSON answer.
  app.get("/api/gateways/:id/open", (c) => {
    if (io.isOperator && !io.isOperator(c)) return c.json({ error: "operator_only" }, 403);
    const g = io.read().gateways.find((x) => x.id === c.req.param("id"));
    if (!g) return c.json({ error: "not_found" }, 404);
    const t = sec?.get(g.id);
    if (t && !isLocal(c)) return c.json({ error: "loopback_only" }, 403);   // a saved key never travels to another device
    return c.redirect(t ? `${g.url}/?gt=${encodeURIComponent(t)}` : g.url);
  });

  app.delete("/api/gateways/:id", (c) => {
    const s = io.read(), id = c.req.param("id");
    if (!s.gateways.some((g) => g.id === id)) return c.json({ error: "not_found" }, 404);
    // an engine that pointed at the removed gateway falls back to the local one: no dangling route
    const left = removeGateway(s.gateways, id);
    const engine = s.engine === "vps" && !left.some((g) => g.kind === "vps") ? "local" : s.engine;
    io.save(Settings.parse({ ...s, gateways: left, engine }));
    sec?.del(id);
    return c.json({ ok: true });
  });

  app.get("/api/gateways/:id/health", async (c) => {
    const id = c.req.param("id");
    if (id === "this-device") return c.json({ id, ok: true, status: 200, latencyMs: 0, version: io.version, error: null } satisfies Health);
    const g = io.read().gateways.find((x) => x.id === id);
    if (!g) return c.json({ error: "not_found" }, 404);
    return c.json(await probe(g, io.doFetch));
  });
}
