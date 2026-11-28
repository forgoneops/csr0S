// What each installed Ollama model can do and how much text it can hold, from Ollama's own /api/show.
// Only names that Ollama itself lists are ever asked about; the answer is cached for a minute.
import type { Hono } from "hono";
import { listInstalled } from "./model-pull";
import { envBase } from "./engines/ollama";

export type ModelInfo = { name: string; capabilities: string[]; maxContext: number | null; setContext: number | null };

const KNOWN = new Set(["vision", "tools", "thinking", "embedding"]);
export function shapeInfo(name: string, show: unknown): ModelInfo {
  const s = (show ?? {}) as { capabilities?: unknown; model_info?: Record<string, unknown>; parameters?: unknown };
  const max = Object.entries(s.model_info ?? {}).find(([k]) => k.endsWith(".context_length"))?.[1];
  const set = typeof s.parameters === "string" ? /^num_ctx\s+(\d+)/m.exec(s.parameters)?.[1] : undefined;
  return {
    name,
    capabilities: Array.isArray(s.capabilities) ? s.capabilities.filter((c): c is string => KNOWN.has(c as string)) : [],
    maxContext: typeof max === "number" && max > 0 ? max : null,
    setContext: set ? Number(set) : null,
  };
}

export function createModelInfo(opts: { baseUrl?: () => string; fetchImpl?: typeof fetch; ttlMs?: number } = {}) {
  const base = opts.baseUrl ?? envBase;
  const doFetch = opts.fetchImpl ?? fetch;
  let cache: { at: number; list: ModelInfo[] } | null = null;
  return async function modelInfo(): Promise<ModelInfo[]> {
    if (cache && Date.now() - cache.at < (opts.ttlMs ?? 60_000)) return cache.list;
    const names = (await listInstalled({ baseUrl: base, fetchImpl: doFetch })).map((m) => m.name).slice(0, 40);
    const list = await Promise.all(names.map(async (name) => {
      try {
        const r = await doFetch(`${base()}/api/show`, { method: "POST", body: JSON.stringify({ model: name }), signal: AbortSignal.timeout(3000) });
        return shapeInfo(name, r.ok ? await r.json() : null);
      } catch { return shapeInfo(name, null); }
    }));
    if (list.length) cache = { at: Date.now(), list };      // an Ollama that is not up yet is asked again next time
    return list;
  };
}

export const modelInfo = createModelInfo();
export const modelInfoApi = (app: Hono) => app.get("/api/models/info", async (c) => c.json(await modelInfo()));
