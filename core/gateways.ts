// Gateway registry (R44): the places this install may talk to, each added by the person. "This device"
// is implicit and never stored. A probe goes only to a gateway in the list (R44 rule 5: no hidden egress),
// never follows a redirect, and is bounded in time and size.
import type { Hono } from "hono";
import { Settings } from "./schema";

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
export function addGateway(list: Gateway[], input: { name?: unknown; url?: unknown; kind?: unknown }): { list: Gateway[] } | { error: string } {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) return { error: "name_required" };
  if (name.length > 60) return { error: "name_long" };
  const c = cleanUrl(input.url);
  if ("error" in c) return c;
  if (list.some((g) => g.url === c.url)) return { error: "url_duplicate" };
  if (list.length >= 8) return { error: "too_many" };
  let id = slug(name) || "gateway";
  for (let n = 2; list.some((g) => g.id === id); n++) id = `${slug(name)}-${n}`.slice(0, 44);
  const host = new URL(c.url).hostname;
  const kind: Gateway["kind"] = input.kind === "local" || input.kind === "vps" ? input.kind : LOOPBACK.has(host) ? "local" : "vps";
  return { list: [...list, { id, name, url: c.url, kind }] };
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

type Io = { read: () => Settings; save: (next: Settings) => void; version: string; doFetch?: typeof fetch };

export function gatewayRoutes(app: Hono, io: Io): void {
  app.get("/api/gateways", (c) => c.json({
    thisDevice: { id: "this-device", name: "This device", version: io.version },
    gateways: io.read().gateways,
  }));

  app.post("/api/gateways", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const s = io.read();
    const r = addGateway(s.gateways, body as object);
    if ("error" in r) return c.json({ error: r.error }, 400);
    const next = Settings.parse({ ...s, gateways: r.list });
    io.save(next);
    return c.json(next.gateways[next.gateways.length - 1], 201);
  });

  app.delete("/api/gateways/:id", (c) => {
    const s = io.read(), id = c.req.param("id");
    if (!s.gateways.some((g) => g.id === id)) return c.json({ error: "not_found" }, 404);
    // an engine that pointed at the removed gateway falls back to the local one: no dangling route
    const left = removeGateway(s.gateways, id);
    const engine = s.engine === "vps" && !left.some((g) => g.kind === "vps") ? "local" : s.engine;
    io.save(Settings.parse({ ...s, gateways: left, engine }));
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
