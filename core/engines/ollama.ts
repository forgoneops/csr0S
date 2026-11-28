// Ollama over its local HTTP API. Loopback by default; an address only comes from the environment the
// person set. No secret is read and nothing is sent anywhere but that one base URL.
import { ENGINES, detectEngines } from "../detect";
import type { ChatMessage, EngineAdapter, EngineEvent, EngineHealth, EngineModel } from "./types";
import { isLocalUrl } from "../scope";
import { isolated } from "../host";

export const DEFAULT_URL = "http://127.0.0.1:11434";

/** A bare host:port becomes http://host:port; a trailing slash is dropped. */
export function normalizeBase(raw: string | undefined): string {
  const v = raw?.trim();
  if (!v) return DEFAULT_URL;
  return (/^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : `http://${v}`).replace(/\/+$/, "");
}

/** The address the person set, else the local default. A throwaway copy has no default (port 0 refuses): the models there are this computer's. */
export const envBase = () => normalizeBase(process.env.CAESAROS_OLLAMA_URL ?? process.env.OLLAMA_HOST ?? (isolated() ? "http://127.0.0.1:0" : undefined));

const isAbort = (e: unknown) => (e as { name?: string } | null)?.name === "AbortError";

type Opts = { baseUrl?: string; fetchImpl?: typeof fetch; detect?: () => Promise<EngineHealth> };

/** S2 detection asks whether the Ollama binary is there and answers; the HTTP check comes after. */
async function detectOllama(): Promise<EngineHealth> {
  const entry = ENGINES.find((e) => e.id === "ollama");
  if (!entry) return { ok: false, detail: "not detected" };
  const [report] = await detectEngines({ engines: [entry] });
  return report?.probe.ok ? { ok: true, detail: null } : { ok: false, detail: "not detected" };
}

type Line = { events: EngineEvent[]; done: boolean };

/** One NDJSON line: a delta, the end, or an error object. A line that is not JSON is skipped. */
function parseLine(raw: string): Line {
  const text = raw.trim();
  if (!text) return { events: [], done: false };
  let j: { message?: { content?: string; thinking?: string }; done?: boolean; error?: string };
  try { j = JSON.parse(text); } catch { return { events: [], done: false }; }
  if (j.error) throw new Error(String(j.error).slice(0, 200));
  const events: EngineEvent[] = [];
  if (j.message?.thinking) events.push({ type: "thinking", text: j.message.thinking });
  if (j.message?.content) events.push({ type: "delta", text: j.message.content });
  if (j.done) events.push({ type: "done" });
  return { events, done: j.done === true };
}

export function createOllamaEngine(opts: Opts = {}): EngineAdapter {
  const base = () => (opts.baseUrl ? normalizeBase(opts.baseUrl) : envBase());
  const doFetch = (input: string, init?: RequestInit): Promise<Response> => (opts.fetchImpl ?? fetch)(input, init);
  const gate = opts.detect ?? detectOllama;

  function tags(signal?: AbortSignal): Promise<Response> {
    const timeout = AbortSignal.timeout(1500);
    return doFetch(`${base()}/api/tags`, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  }

  return {
    id: "ollama",
    label: "Ollama",
    scope: () => (isLocalUrl(base()) ? "local" : "cloud"),
    vision: true,

    async health(o): Promise<EngineHealth> {
      try {
        const seen = await gate();
        if (!seen.ok) return { ok: false, detail: "not detected" };
        const r = await tags(o?.signal);
        if (!r.ok) return { ok: false, detail: "not answering" };
        await r.body?.cancel().catch(() => {});
        return { ok: true, detail: null };
      } catch {
        return { ok: false, detail: "not answering" };
      }
    },

    async models(o): Promise<EngineModel[]> {
      let r: Response;
      try { r = await tags(o?.signal); } catch { throw new Error("Ollama is not answering"); }
      if (!r.ok) throw new Error(`Ollama answered ${r.status} when asked for its models`);
      const body = await r.json().catch(() => null) as { models?: { name?: string; model?: string }[] } | null;
      const out: EngineModel[] = [];
      for (const m of body?.models ?? []) {
        const id = m.name ?? m.model;
        if (id) out.push({ id, label: id });
      }
      return out;
    },

    async *stream(messages: ChatMessage[], o): AsyncGenerator<EngineEvent> {
      const { model, signal, think } = o;
      if (signal?.aborted) return;
      let res: Response;
      try {
        res = await doFetch(`${base()}/api/chat`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ model, messages: messages.map(({ images, ...m }) => (images?.length ? { ...m, images: images.map((i) => i.data) } : m)), stream: true, ...(think ? { think: true } : {}) }),
          signal,
        });
      } catch (e) {
        if (signal?.aborted || isAbort(e)) return;
        throw new Error("engine is not answering");
      }
      if (!res.ok) {
        const excerpt = (await res.text().catch(() => "")).replace(/\s+/g, " ").trim().slice(0, 200);
        throw new Error(`Ollama answered ${res.status}${excerpt ? `: ${excerpt}` : ""}`);
      }
      if (!res.body) throw new Error("engine stopped answering");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      try {
        for (;;) {
          let chunk: Awaited<ReturnType<typeof reader.read>>;
          try { chunk = await reader.read(); } catch (e) {
            if (signal?.aborted || isAbort(e)) return;
            throw new Error("engine stopped answering");
          }
          if (signal?.aborted) return;
          if (chunk.done) {
            const last = parseLine(buf + decoder.decode());
            for (const ev of last.events) yield ev;
            if (last.done) return;
            throw new Error("engine stopped answering"); // the body ended before the engine said it was done
          }
          buf += decoder.decode(chunk.value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const parsed = parseLine(buf.slice(0, nl));
            buf = buf.slice(nl + 1);
            for (const ev of parsed.events) yield ev;
            if (parsed.done) return;
          }
        }
      } finally {
        reader.cancel().catch(() => {});
      }
    },
  };
}

export const ollama = createOllamaEngine();
