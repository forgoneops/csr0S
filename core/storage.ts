// The Storage page: how much room each part of CaesarOS takes, and clearing of what can be made again.
// The server owns both lists. A client names an id from CLEARABLE and nothing else: no path is ever accepted or returned.
// Local chat models are listed by /api/models/installed and the machine by /api/hardware; neither is repeated here.
import type { Context, Hono } from "hono";
import { lstatSync, readdirSync, rmSync } from "node:fs";
import { lstat, readdir } from "node:fs/promises";
import { join } from "node:path";

/** App data by area: top-level names in the data folder. Whatever is not named here is counted as "Everything else". */
const AREAS: { id: string; name: string; entries: string[] }[] = [
  { id: "database", name: "Chats and settings", entries: ["caesaros.db", "caesaros.db-wal", "caesaros.db-shm"] },
  { id: "notes", name: "Notes", entries: ["notes"] },
  { id: "library", name: "Library files", entries: ["library"] },
  { id: "images", name: "Pictures you made", entries: ["images"] },
  { id: "mail", name: "Mail", entries: ["mail"] },
  { id: "backups", name: "Backups", entries: ["backups"] },
  { id: "modules", name: "Add-ons", entries: ["modules", "marketplace"] },
  { id: "terminal", name: "Terminal sessions", entries: ["terminal"] },
];

/** The only things that can be cleared: derived files the core makes again on demand from originals it keeps. */
export const CLEARABLE: Record<string, { name: string; note: string; path: string[] }> = {
  "library-previews": { name: "Library previews", note: "Page pictures and converted copies of your library files. Your files stay; a preview is made again when you open one.", path: ["library", "cache"] },
};

/** Bytes under a path. Links are counted as links and never followed; what cannot be read counts as nothing. */
export async function sizeOf(path: string, skip?: string): Promise<number> {
  if (path === skip) return 0;
  try {
    const s = await lstat(path);
    if (!s.isDirectory()) return s.size;
    let sum = 0;
    for (const n of await readdir(path)) sum += await sizeOf(join(path, n), skip);
    return sum;
  } catch { return 0; }
}

/** The cache folder, only if every step down to it is a real folder: a link would let a clear reach somewhere else. */
function cacheDir(dataDir: string, parts: string[]): string | null {
  let p = dataDir;
  for (const part of parts) {
    p = join(p, part);
    try { if (!lstatSync(p).isDirectory()) return null; } catch { return null; }
  }
  return p;
}

export async function storageReport(dataDir: string) {
  const caches = await Promise.all(Object.entries(CLEARABLE).map(async ([id, c]) => {
    const dir = cacheDir(dataDir, c.path);
    // the folder itself stays after a clear, so an empty one is 0 bytes, not the size of the directory entries
    const bytes = dir ? (await Promise.all((await readdir(dir)).map((n) => sizeOf(join(dir, n))))).reduce((a, b) => a + b, 0) : 0;
    return { id, name: c.name, note: c.note, bytes };
  }));
  const skip = join(dataDir, ...CLEARABLE["library-previews"]!.path);
  const sum = async (names: string[]) => (await Promise.all(names.map((n) => sizeOf(join(dataDir, n), skip)))).reduce((a, b) => a + b, 0);
  const areas = await Promise.all(AREAS.map(async (a) => ({ id: a.id, name: a.name, bytes: await sum(a.entries) })));
  const named = new Set(AREAS.flatMap((a) => a.entries));
  let rest: string[] = [];
  try { rest = (await readdir(dataDir)).filter((n) => !named.has(n)); } catch { /* unreadable data folder: nothing else to count */ }
  areas.push({ id: "other", name: "Everything else", bytes: await sum(rest) });
  return { areas, caches };
}

/** Empties one allowed cache. The folder itself stays, so the next preview has somewhere to go. */
export async function clearCache(dataDir: string, id: unknown): Promise<{ freed: number } | { error: "not_clearable" | "failed" }> {
  if (typeof id !== "string" || !Object.hasOwn(CLEARABLE, id)) return { error: "not_clearable" };
  const dir = cacheDir(dataDir, CLEARABLE[id]!.path);
  if (!dir) return { freed: 0 };
  try {
    let freed = 0;
    for (const n of readdirSync(dir)) {
      const bytes = await sizeOf(join(dir, n));
      rmSync(join(dir, n), { recursive: true, force: true });   // a link inside is removed as a link; its target is left alone
      freed += bytes;
    }
    return { freed };
  } catch { return { error: "failed" }; }
}

type Opts = { dataDir: string; busy?: () => boolean; engines?: () => { name: string; dir: string }[]; voicesDir?: () => string };

export function storageApi(app: Hono, isOperator: (c: Context) => boolean, o: Opts) {
  const guard = (c: Context) => (isOperator(c) ? null : c.json({ error: "operator_only" }, 403));
  app.get("/api/storage", async (c) => {
    const g = guard(c); if (g) return g;
    // local engines live outside the data folder: sizes only, never clearable
    const engines = (await Promise.all((o.engines?.() ?? []).map(async (e) => ({ name: e.name, bytes: await sizeOf(e.dir) })))).filter((e) => e.bytes > 0);
    const dir = o.voicesDir?.();
    let names: string[] = [];
    try { if (dir) names = readdirSync(dir).filter((n) => n.endsWith(".onnx")).sort(); } catch { /* no voices installed */ }
    const voices = await Promise.all(names.map(async (n) => ({ name: n.slice(0, -5), bytes: await sizeOf(join(dir!, n)) })));
    return c.json({ ...(await storageReport(o.dataDir)), engines, voices });
  });
  app.post("/api/storage/clear", async (c) => {
    const g = guard(c); if (g) return g;
    if (o.busy?.()) return c.json({ error: "busy" }, 409);
    const body = await c.req.json().catch(() => null) as { id?: unknown } | null;
    const r = await clearCache(o.dataDir, body?.id);
    return "error" in r ? c.json(r, r.error === "failed" ? 500 : 400) : c.json(r);
  });
}
