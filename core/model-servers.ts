// Model servers (R47): OpenAI-compatible addresses the person adds. Each one is registered as an engine
// "server-<id>"; removing it unregisters it. The list lives in settings, so a restart restores it.
import type { Hono } from "hono";
import { cleanUrl, slug } from "./gateways";
import { createOpenAiCompatEngine, normalizeBase } from "./engines/openai-compat";
import { listEngines, registerEngine, unregisterEngine } from "./engines";
import { Settings } from "./schema";
import { kv } from "./db";

export type ModelServer = Settings["modelServers"][number];

/** API keys, kept apart from settings (which the API returns whole). Written only by the operator, never read back out. */
const secrets = kv("core.model-server-keys");
const keys = () => secrets.get<Record<string, string>>("keys", {});
export const keyFor = (id: string): string | undefined => keys()[id] || undefined;
export const hasKey = (id: string): boolean => !!keyFor(id);
/** A usable key: printable, no spaces or line breaks (it goes into a header), not absurdly long. */
export const validKey = (k: unknown): k is string => typeof k === "string" && k.length >= 1 && k.length <= 500 && /^[\x21-\x7e]+$/.test(k);
const setKey = (id: string, key: string | null) => { const all = keys(); if (key) all[id] = key; else delete all[id]; secrets.set("keys", all); };
const prune = (ids: string[]) => { const all = keys(); let changed = false; for (const id of Object.keys(all)) if (!ids.includes(id)) { delete all[id]; changed = true; } if (changed) secrets.set("keys", all); };
export const engineId = (s: ModelServer) => `server-${s.id}`;

export function addServer(list: ModelServer[], input: { name?: unknown; url?: unknown }): { list: ModelServer[] } | { error: string } {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) return { error: "name_required" };
  if (name.length > 60) return { error: "name_long" };
  const c = cleanUrl(typeof input.url === "string" ? normalizeBase(input.url) : input.url);
  if ("error" in c) return c;
  if (list.some((s) => s.url === c.url)) return { error: "url_duplicate" };
  if (list.length >= 4) return { error: "too_many" };
  let id = slug(name) || "server";
  for (let n = 2; list.some((s) => s.id === id); n++) id = `${slug(name)}-${n}`.slice(0, 44);
  return { list: [...list, { id, name, url: c.url }] };
}

/** Make the registry match the list exactly: drop every "server-*" engine, then register the current ones. */
export function syncModelServers(list: ModelServer[], fetchImpl?: typeof fetch): void {
  prune(list.map((x) => x.id));
  for (const e of listEngines()) if (e.id.startsWith("server-")) unregisterEngine(e.id);
  for (const s of list) registerEngine(createOpenAiCompatEngine({ id: engineId(s), label: s.name, baseUrl: s.url, fetchImpl, apiKey: () => keyFor(s.id) }));
}

type Io = { read: () => Settings; save: (next: Settings) => void };
/** What the API shows of a server: never the key, only whether one is stored. */
const shown = (x: ModelServer) => ({ ...x, hasKey: hasKey(x.id) });

export function modelServerRoutes(app: Hono, io: Io): void {
  app.get("/api/model-servers", (c) => c.json(io.read().modelServers.map(shown)));

  app.post("/api/model-servers", async (c) => {
    const s = io.read();
    const body = await c.req.json().catch(() => ({})) as { name?: unknown; url?: unknown; key?: unknown };
    const wantsKey = body.key !== undefined && body.key !== null && body.key !== "";
    if (wantsKey && !validKey(body.key)) return c.json({ error: "key_invalid" }, 400);
    const r = addServer(s.modelServers, body);
    if ("error" in r) return c.json({ error: r.error }, 400);
    const next = Settings.parse({ ...s, modelServers: r.list });
    const made = next.modelServers[next.modelServers.length - 1];
    io.save(next);
    if (wantsKey) setKey(made.id, body.key as string);
    syncModelServers(next.modelServers);
    return c.json(shown(made), 201);
  });

  /** Set or clear the key of an existing server. An empty key removes it. */
  app.put("/api/model-servers/:id/key", async (c) => {
    const id = c.req.param("id");
    if (!io.read().modelServers.some((x) => x.id === id)) return c.json({ error: "not_found" }, 404);
    const { key } = await c.req.json().catch(() => ({})) as { key?: unknown };
    if (key === "" || key === null) { setKey(id, null); return c.json({ hasKey: false }); }
    if (!validKey(key)) return c.json({ error: "key_invalid" }, 400);
    setKey(id, key);
    return c.json({ hasKey: true });
  });

  app.delete("/api/model-servers/:id", (c) => {
    const s = io.read(), id = c.req.param("id");
    if (!s.modelServers.some((x) => x.id === id)) return c.json({ error: "not_found" }, 404);
    const next = Settings.parse({ ...s, modelServers: s.modelServers.filter((x) => x.id !== id) });
    io.save(next); syncModelServers(next.modelServers);          // sync also drops the key
    return c.json({ ok: true });
  });
}
