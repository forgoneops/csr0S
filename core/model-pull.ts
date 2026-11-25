// Safe model download, the Ollama way: Ollama owns the queue, the partial files and the
// verify step; we start one pull, read its progress and show it. Only models from our own catalog can be
// asked for, one at a time, and the person has to press the button (the write guard in server.ts applies).
import type { Hono } from "hono";
import { CATALOG } from "./hardware";
import { normalizeBase } from "./engines/ollama";

export type PullState = { model: string; status: string; completed: number; total: number; done: boolean; error: string | null } | null;

export function createPuller(opts: { baseUrl?: () => string; fetchImpl?: typeof fetch } = {}) {
  let state: PullState = null;
  let abort: AbortController | null = null;
  const base = opts.baseUrl ?? (() => normalizeBase(process.env.CAESAROS_OLLAMA_URL ?? process.env.OLLAMA_HOST));
  const doFetch = opts.fetchImpl ?? fetch;

  async function run(model: string, signal: AbortSignal) {
    try {
      const res = await doFetch(`${base()}/api/pull`, { method: "POST", body: JSON.stringify({ model, stream: true }), signal });
      if (!res.ok || !res.body) throw new Error(`Ollama answered ${res.status}`);
      const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
          if (!line) continue;
          const j = JSON.parse(line) as { status?: string; completed?: number; total?: number; error?: string };
          if (j.error) throw new Error(String(j.error).slice(0, 200));
          state = { model, status: j.status ?? "", completed: j.completed ?? state?.completed ?? 0, total: j.total ?? state?.total ?? 0, done: j.status === "success", error: null };
        }
      }
      if (state && !state.done) state = { ...state, done: true };
    } catch (e) {
      if (signal.aborted) state = { model, status: "cancelled", completed: 0, total: 0, done: true, error: null };
      else state = { model, status: "failed", completed: state?.completed ?? 0, total: state?.total ?? 0, done: true, error: e instanceof Error ? e.message.slice(0, 200) : "download failed" };
    } finally { abort = null; }
  }

  return {
    get: () => state,
    start(model: string): { ok: true } | { ok: false; error: "not_in_catalog" | "busy" } {
      if (!CATALOG.some((c) => c.model === model)) return { ok: false, error: "not_in_catalog" };
      if (abort) return { ok: false, error: "busy" };
      abort = new AbortController();
      state = { model, status: "starting", completed: 0, total: 0, done: false, error: null };
      void run(model, abort.signal);
      return { ok: true };
    },
    cancel() { abort?.abort(); },
  };
}

type Installed = { name: string; sizeGb: number };

/** Installed models from Ollama's own list; an unreachable Ollama is an empty list, not an error. */
export async function listInstalled(opts: { baseUrl?: () => string; fetchImpl?: typeof fetch } = {}): Promise<Installed[]> {
  const base = opts.baseUrl ?? (() => normalizeBase(process.env.CAESAROS_OLLAMA_URL ?? process.env.OLLAMA_HOST));
  try {
    const r = await (opts.fetchImpl ?? fetch)(`${base()}/api/tags`, { signal: AbortSignal.timeout(1500) });
    if (!r.ok) return [];
    const j = await r.json() as { models?: { name?: string; size?: number }[] };
    return (j.models ?? []).filter((m) => m.name).map((m) => ({ name: String(m.name), sizeGb: Math.round(((m.size ?? 0) / 1024 ** 3) * 10) / 10 }));
  } catch { return []; }
}

export function modelPullApi(app: Hono, puller = createPuller()) {
  app.get("/api/models/installed", async (c) => c.json(await listInstalled()));
  // Delete only what Ollama itself lists, so a made-up name cannot reach its delete call.
  app.delete("/api/models/installed", async (c) => {
    const body = await c.req.json().catch(() => ({})) as { name?: unknown };
    const name = typeof body.name === "string" ? body.name : "";
    if (!(await listInstalled()).some((m) => m.name === name)) return c.json({ error: "not_installed" }, 404);
    const r = await fetch(`${normalizeBase(process.env.CAESAROS_OLLAMA_URL ?? process.env.OLLAMA_HOST)}/api/delete`, { method: "DELETE", body: JSON.stringify({ model: name }) }).catch(() => null);
    return r?.ok ? c.json({ ok: true }) : c.json({ error: "delete_failed" }, 502);
  });
  app.get("/api/models/pull", (c) => c.json(puller.get()));
  app.post("/api/models/pull", async (c) => {
    const body = await c.req.json().catch(() => ({})) as { model?: unknown };
    const r = puller.start(typeof body.model === "string" ? body.model : "");
    return r.ok ? c.json({ ok: true }, 202) : c.json({ error: r.error }, r.error === "busy" ? 409 : 400);
  });
  app.delete("/api/models/pull", (c) => { puller.cancel(); return c.json({ ok: true }); });
}
