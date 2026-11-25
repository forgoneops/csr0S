// The engine layer: the Ollama adapter against a fake fetch and a fake detection gate, and the registry.
// No network, no process, no model.
import { describe, expect, test } from "bun:test";
import { createOllamaEngine, normalizeBase } from "../core/engines/ollama";
import { getEngine, listEngines, registerEngine, resetEngines } from "../core/engines";
import type { EngineAdapter, EngineEvent } from "../core/engines";

const found = async () => ({ ok: true, detail: null });
const ndjson = (lines: unknown[]) => new Response(lines.map((l) => JSON.stringify(l)).join("\n") + "\n", { status: 200 });
const fake = (handler: (url: string, init?: RequestInit) => Response | Promise<Response>) =>
  ((url: string, init?: RequestInit) => Promise.resolve(handler(String(url), init))) as unknown as typeof fetch;
const collect = async (it: AsyncIterable<EngineEvent>) => { const out: EngineEvent[] = []; for await (const e of it) out.push(e); return out; };

describe("ollama adapter", () => {
  test("a bare host:port becomes an http URL and the default is loopback", () => {
    expect(normalizeBase("172.16.0.5:11434")).toBe("http://172.16.0.5:11434");
    expect(normalizeBase("https://x.test/")).toBe("https://x.test");
    expect(normalizeBase(undefined)).toBe("http://127.0.0.1:11434");
  });

  test("health is 'not detected' when detection says so, and never asks the network", async () => {
    let called = false;
    const e = createOllamaEngine({ detect: async () => ({ ok: false, detail: "x" }), fetchImpl: fake(() => { called = true; return new Response("{}"); }) });
    expect(await e.health()).toEqual({ ok: false, detail: "not detected" });
    expect(called).toBe(false);
  });

  test("health is 'not answering' on a non-OK answer or a network failure, and ok otherwise", async () => {
    expect(await createOllamaEngine({ detect: found, fetchImpl: fake(() => new Response("no", { status: 500 })) }).health()).toEqual({ ok: false, detail: "not answering" });
    const down = (() => Promise.reject(new TypeError("refused"))) as unknown as typeof fetch;
    expect(await createOllamaEngine({ detect: found, fetchImpl: down }).health()).toEqual({ ok: false, detail: "not answering" });
    expect(await createOllamaEngine({ detect: found, fetchImpl: fake(() => Response.json({ models: [] })) }).health()).toEqual({ ok: true, detail: null });
  });

  test("models parse from /api/tags, name first then model", async () => {
    const e = createOllamaEngine({ baseUrl: "127.0.0.1:1", fetchImpl: fake((url) => {
      expect(url).toBe("http://127.0.0.1:1/api/tags");
      return Response.json({ models: [{ name: "llama3:8b" }, { model: "qwen2:1.5b" }, {}] });
    }) });
    expect(await e.models()).toEqual([{ id: "llama3:8b", label: "llama3:8b" }, { id: "qwen2:1.5b", label: "qwen2:1.5b" }]);
  });

  test("models throws a readable error when the engine fails", async () => {
    const e = createOllamaEngine({ fetchImpl: fake(() => new Response("", { status: 503 })) });
    await expect(e.models()).rejects.toThrow("503");
  });

  test("stream sends the chat request and yields deltas then done", async () => {
    const got: { sent?: { model: string; stream: boolean; messages: unknown[] } } = {};
    const e = createOllamaEngine({ fetchImpl: fake((url, init) => {
      expect(url.endsWith("/api/chat")).toBe(true);
      got.sent = JSON.parse(String(init?.body));
      return ndjson([{ message: { content: "Hel" } }, { message: { content: "" } }, { message: { content: "lo" } }, { done: true }, { message: { content: "never" } }]);
    }) });
    const out = await collect(e.stream([{ role: "user", content: "hi" }], { model: "m1" }));
    expect(out).toEqual([{ type: "delta", text: "Hel" }, { type: "delta", text: "lo" }, { type: "done" }]);
    expect(got.sent).toEqual({ model: "m1", messages: [{ role: "user", content: "hi" }], stream: true });
  });

  test("stream reassembles a line split across chunks", async () => {
    const enc = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({ start(c) {
      c.enqueue(enc.encode('{"message":{"content":"a"}}\n{"message":{"con'));
      c.enqueue(enc.encode('tent":"b"}}\n{"done":true}\n'));
      c.close();
    } });
    const e = createOllamaEngine({ fetchImpl: fake(() => new Response(body)) });
    expect(await collect(e.stream([], { model: "m" }))).toEqual([{ type: "delta", text: "a" }, { type: "delta", text: "b" }, { type: "done" }]);
  });

  test("a non-2xx answer throws with the status and a short excerpt", async () => {
    const e = createOllamaEngine({ fetchImpl: fake(() => new Response('{"error":"model not found"}', { status: 404 })) });
    await expect(collect(e.stream([], { model: "nope" }))).rejects.toThrow(/404.*model not found/);
  });

  test("a network failure mid-stream throws 'engine stopped answering', after the deltas already sent", async () => {
    const enc = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(c) { c.enqueue(enc.encode('{"message":{"content":"par"}}\n')); },
      pull(c) { c.error(new TypeError("connection reset")); },
    });
    const e = createOllamaEngine({ fetchImpl: fake(() => new Response(body)) });
    const seen: EngineEvent[] = [];
    let err: Error | null = null;
    try { for await (const ev of e.stream([], { model: "m" })) seen.push(ev); } catch (x) { err = x as Error; }
    expect(seen).toEqual([{ type: "delta", text: "par" }]);
    expect(err?.message).toBe("engine stopped answering");
  });

  test("abort ends iteration quietly and reaches fetch", async () => {
    const ac = new AbortController();
    let fetchSignal: AbortSignal | null | undefined;
    const enc = new TextEncoder();
    const e = createOllamaEngine({ fetchImpl: fake((_u, init) => {
      fetchSignal = init?.signal;
      const body = new ReadableStream<Uint8Array>({
        start(c) { c.enqueue(enc.encode('{"message":{"content":"one"}}\n')); init?.signal?.addEventListener("abort", () => c.error(new DOMException("aborted", "AbortError"))); },
      });
      return new Response(body);
    }) });
    const seen: EngineEvent[] = [];
    for await (const ev of e.stream([], { model: "m", signal: ac.signal })) { seen.push(ev); ac.abort(); }
    expect(seen).toEqual([{ type: "delta", text: "one" }]);
    expect(fetchSignal?.aborted).toBe(true);
  });

  test("an abort before the request leaves nothing and throws nothing", async () => {
    const ac = new AbortController(); ac.abort();
    const e = createOllamaEngine({ fetchImpl: fake(() => { throw new Error("must not fetch"); }) });
    expect(await collect(e.stream([], { model: "m", signal: ac.signal }))).toEqual([]);
  });
});

describe("engine registry", () => {
  const stub = (id: string, label = id): EngineAdapter => ({
    id, label, health: async () => ({ ok: true, detail: null }), models: async () => [],
    stream: async function* () { yield { type: "done" } as const; },
  });

  test("register, get and replace by id; reset restores the shipped defaults", () => {
    resetEngines();
    expect(listEngines().map((e) => e.id)).toEqual(["ollama", "claude", "codex", "gemini"]);
    registerEngine(stub("fake", "One"));
    registerEngine(stub("fake", "Two"));
    expect(getEngine("fake")?.label).toBe("Two");
    expect(listEngines().map((e) => e.id)).toEqual(["ollama", "claude", "codex", "gemini", "fake"]);
    expect(getEngine("missing")).toBeUndefined();
    resetEngines();
    expect(getEngine("fake")).toBeUndefined();
    expect(getEngine("ollama")?.label).toBe("Ollama");
  });
});
