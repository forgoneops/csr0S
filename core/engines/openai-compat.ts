// Any server that speaks the OpenAI-compatible chat API (llama.cpp server, LM Studio, vLLM, Jan, and so on).
// The person adds the address; nothing is contacted until they do. An optional API key is sent as a bearer token to
// that address only, and a redirect is refused while a key is attached, so it cannot be forwarded anywhere else.
import type { ChatMessage, EngineAdapter, EngineEvent, EngineHealth, EngineModel } from "./types";
import { isLocalUrl } from "../scope";

/** http(s) origin plus path, with a trailing /v1 and slashes dropped so the caller always adds /v1/... itself. */
export function normalizeBase(raw: string): string {
  const v = raw.trim().replace(/\/+$/, "").replace(/\/v1$/i, "");
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : `http://${v}`;
}

const isAbort = (e: unknown) => (e as { name?: string } | null)?.name === "AbortError";
type Opts = { id: string; label: string; baseUrl: string; fetchImpl?: typeof fetch; apiKey?: () => string | undefined };

type Delta = { events: EngineEvent[]; done: boolean };

/** One SSE `data:` line. Comments, blank lines and non-JSON are skipped; [DONE] ends the stream; an error object throws. */
export function parseSseLine(raw: string): Delta {
  const line = raw.trim();
  if (!line.startsWith("data:")) return { events: [], done: false };
  const payload = line.slice(5).trim();
  if (payload === "[DONE]") return { events: [{ type: "done" }], done: true };
  let j: { error?: { message?: string } | string; choices?: { delta?: { content?: string | null; reasoning_content?: string | null }; finish_reason?: string | null }[] };
  try { j = JSON.parse(payload); } catch { return { events: [], done: false }; }
  if (j.error) throw new Error((typeof j.error === "string" ? j.error : j.error.message ?? "engine error").slice(0, 200));
  const c = j.choices?.[0];
  const events: EngineEvent[] = [];
  if (c?.delta?.reasoning_content) events.push({ type: "thinking", text: c.delta.reasoning_content });
  if (c?.delta?.content) events.push({ type: "delta", text: c.delta.content });
  return { events, done: false };
}

export function createOpenAiCompatEngine(o: Opts): EngineAdapter {
  const base = normalizeBase(o.baseUrl);
  // The key is read per request, so changing it takes effect at once and it is never held in a closure of old state.
  const doFetch = (input: string, init: RequestInit = {}) => {
    const key = o.apiKey?.();
    if (!key) return (o.fetchImpl ?? fetch)(input, init);
    return (o.fetchImpl ?? fetch)(input, { ...init, redirect: "error", headers: { ...(init.headers as Record<string, string> | undefined), authorization: `Bearer ${key}` } });
  };
  const list = (signal?: AbortSignal) => {
    const t = AbortSignal.timeout(2000);
    return doFetch(`${base}/v1/models`, { signal: signal ? AbortSignal.any([signal, t]) : t, headers: { accept: "application/json" } });
  };

  return {
    id: o.id,
    label: o.label,
    scope: () => (isLocalUrl(base) ? "local" : "cloud"),
    vision: true,

    async health(x): Promise<EngineHealth> {
      try {
        const r = await list(x?.signal);
        await r.body?.cancel().catch(() => {});
        return r.ok ? { ok: true, detail: null } : { ok: false, detail: `answered ${r.status}` };
      } catch { return { ok: false, detail: "not answering" }; }
    },

    async models(x): Promise<EngineModel[]> {
      let r: Response;
      try { r = await list(x?.signal); } catch { throw new Error(`${o.label} is not answering`); }
      if (!r.ok) throw new Error(`${o.label} answered ${r.status} when asked for its models`);
      const body = await r.json().catch(() => null) as { data?: { id?: string }[] } | null;
      return (body?.data ?? []).flatMap((m) => (m.id ? [{ id: m.id, label: m.id }] : []));
    },

    async *stream(messages: ChatMessage[], x): AsyncGenerator<EngineEvent> {
      const { model, signal } = x;
      if (signal?.aborted) return;
      let res: Response;
      try {
        res = await doFetch(`${base}/v1/chat/completions`, {
          method: "POST", headers: { "content-type": "application/json", accept: "text/event-stream" },
          body: JSON.stringify({ model, messages: messages.map(({ images, ...m }) => (images?.length ? { ...m, content: [{ type: "text", text: m.content }, ...images.map((i) => ({ type: "image_url", image_url: { url: `data:${i.mime};base64,${i.data}` } }))] } : m)), stream: true }), signal,
        });
      } catch (e) {
        if (signal?.aborted || isAbort(e)) return;
        throw new Error("engine is not answering");
      }
      if (!res.ok) {
        const excerpt = (await res.text().catch(() => "")).replace(/\s+/g, " ").trim().slice(0, 200);
        throw new Error(`${o.label} answered ${res.status}${excerpt ? `: ${excerpt}` : ""}`);
      }
      if (!res.body) throw new Error("engine stopped answering");
      const reader = res.body.getReader();
      const dec = new TextDecoder();
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
            const last = parseSseLine(buf + dec.decode());
            for (const ev of last.events) yield ev;
            if (last.done) return;
            throw new Error("engine stopped answering");   // the body ended before [DONE]
          }
          buf += dec.decode(chunk.value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const parsed = parseSseLine(buf.slice(0, nl));
            buf = buf.slice(nl + 1);
            for (const ev of parsed.events) yield ev;
            if (parsed.done) return;
          }
        }
      } finally { reader.cancel().catch(() => {}); }
    },
  };
}
