// Safe model download, the Ollama way: Ollama owns the partial files, resuming and the checksum step;
// we run one pull at a time, line up the rest in a short queue, read the progress and show it. Only models from
// our own catalog can be asked for, and the person has to press the button (the write guard in server.ts applies).
// A failed download stays listed so it can be tried again. shortcut: the queue is kept in memory, a restart forgets it.
import type { Hono } from "hono";
import { CATALOG } from "./hardware";
import { normalizeBase } from "./engines/ollama";

export type PullState = { model: string; status: string; completed: number; total: number; done: boolean; error: string | null } | null;

export const QUEUE_MAX = 5;
export type PullView = (NonNullable<PullState> & { queue: string[]; failed: { model: string; error: string }[] }) | null;

export function createPuller(opts: { baseUrl?: () => string; fetchImpl?: typeof fetch } = {}) {
  let state: PullState = null;
  let abort: AbortController | null = null;
  let queue: string[] = [];
  let failed: { model: string; error: string }[] = [];
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
    } finally {
      abort = null;
      if (state?.model === model && state.error) failed.push({ model, error: state.error });
      const next = queue.shift();
      if (next) launch(next);
    }
  }

  function launch(model: string) {
    failed = failed.filter((f) => f.model !== model);
    abort = new AbortController();
    state = { model, status: "starting", completed: 0, total: 0, done: false, error: null };
    void run(model, abort.signal);
  }

  return {
    get: (): PullView => (state ? { ...state, queue: [...queue], failed: [...failed] } : null),
    start(model: string): { ok: true; queued: boolean } | { ok: false; error: "not_in_catalog" | "busy" | "queue_full" } {
      if (!CATALOG.some((c) => c.model === model)) return { ok: false, error: "not_in_catalog" };
      if (!abort) { launch(model); return { ok: true, queued: false }; }
      if (state?.model === model || queue.includes(model)) return { ok: false, error: "busy" };
      if (queue.length >= QUEUE_MAX) return { ok: false, error: "queue_full" };
      queue.push(model);
      failed = failed.filter((f) => f.model !== model);    // asked again: no longer a failure while it waits
      return { ok: true, queued: true };
    },
    /** With a name: takes that one out of the line, or stops it if it is the one running. Without: stops the running one; the next starts. */
    cancel(model?: string) {
      if (model && queue.includes(model)) queue = queue.filter((m) => m !== model);
      else if (!model || state?.model === model) abort?.abort();
    },
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
    return r.ok ? c.json({ ok: true, queued: r.queued }, 202) : c.json({ error: r.error }, r.error === "not_in_catalog" ? 400 : 409);
  });
  app.delete("/api/models/pull", (c) => { puller.cancel(c.req.query("model")); return c.json({ ok: true }); });
}
