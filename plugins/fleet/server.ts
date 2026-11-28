// Fleet: servers where CAESAR runs for other people. Read only. Each row is asked how it is (GET only) and never changed.
// A server that runs this module too answers /self with disk, memory and load; any other CAESAR still answers /api/health.
import { freemem, loadavg, totalmem, cpus } from "node:os";
import { statfsSync } from "node:fs";
import type { PluginContext } from "../../core/plugins";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { DATA } from "../../core/db";
import { isolated } from "../../core/host";
import { ROOT } from "../../core/root";

export type Server = { id: string; name: string; url: string };
export type Row = Server & { reachable: boolean; version?: string; diskPct?: number; memPct?: number; load?: number; ms?: number; error?: string };
const MAX = 30;

/** Only a plain http(s) address, no sign-in inside it, no path: what the owner typed is trimmed to its origin. */
export function cleanUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  try { const u = new URL(raw.trim()); return (u.protocol === "http:" || u.protocol === "https:") && !u.username && !u.password ? u.origin : null; } catch { return null; }
}

export function selfStats(version: string) {
  if (isolated()) return { version };   // a throwaway copy tells no one about this computer
  const s = statfsSync(DATA), total = s.blocks * s.bsize, free = s.bavail * s.bsize;
  return { version, diskPct: total ? Math.round((1 - free / total) * 100) : 0, memPct: Math.round((1 - freemem() / totalmem()) * 100), load: Math.round((loadavg()[0] ?? 0) / Math.max(1, cpus().length) * 100) / 100 };
}

const appVersion = () => { try { return String(JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version ?? "dev"); } catch { return "dev"; } };
const get = async (url: string) => { const r = await fetch(url, { signal: AbortSignal.timeout(4000), redirect: "manual" }); return r.ok ? await r.json() as Record<string, unknown> : null; };
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

export async function probe(s: Server): Promise<Row> {
  const t = Date.now();
  try {
    const self = await get(`${s.url}/api/p/fleet/self`).catch(() => null);
    const h = self ?? await get(`${s.url}/api/health`);
    if (!h) return { ...s, reachable: false, error: "answered with an error" };
    return { ...s, reachable: true, ms: Date.now() - t, version: typeof h.version === "string" ? h.version : undefined, diskPct: num(h.diskPct), memPct: num(h.memPct), load: num(h.load) };
  } catch { return { ...s, reachable: false, error: "no answer" }; }
}

export default function fleet(ctx: PluginContext) {
  const all = () => ctx.store.get<Server[]>("servers", []);
  ctx.routes.get("/self", (c) => c.json(selfStats(appVersion())));
  ctx.routes.get("/servers", (c) => c.json(all()));
  ctx.routes.get("/status", async (c) => c.json(await Promise.all(all().map(probe))));
  ctx.routes.post("/servers", async (c) => {
    const b = await c.req.json().catch(() => ({})) as { name?: unknown; url?: unknown };
    const name = typeof b.name === "string" ? b.name.trim().slice(0, 40) : "", url = cleanUrl(b.url);
    if (!name || !url) return c.json({ error: "A server needs a name and an http or https address." }, 400);
    if (all().length >= MAX) return c.json({ error: `At most ${MAX} servers.` }, 400);
    if (all().some((s) => s.url === url)) return c.json({ error: "That server is already listed." }, 409);
    const s: Server = { id: crypto.randomUUID().slice(0, 8), name, url };
    ctx.store.set("servers", [...all(), s]);
    return c.json(s, 201);
  });
  ctx.routes.delete("/servers/:id", (c) => { ctx.store.set("servers", all().filter((s) => s.id !== c.req.param("id"))); return c.json({ removed: true }); });
}
