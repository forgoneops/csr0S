// The context meter and compaction: nothing is deleted, the summary is what the next turn sends, and it can be undone.
import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.CAESAROS_DATA ??= mkdtempSync(join(tmpdir(), "caesaros-cc-"));
process.env.CAESAROS_MODULE_DIRS = "plugins";
const { appendMessage, chatApi, createSession, getSession } = await import("../core/chat");
const { cutAt, summaryOf } = await import("../core/chat-context");
const { registerEngine, unregisterEngine } = await import("../core/engines");
const { createModelInfo, shapeInfo } = await import("../core/model-info");

const seen: { role: string; content: string }[][] = [];
let answer = "- they chose the blue gate";
const engine = { id: "ctx-probe", label: "Probe", scope: () => "local" as const, health: async () => ({ ok: true, detail: null }), models: async () => [{ id: "m", label: "m" }], async *stream(messages: { role: string; content: string }[]) { seen.push(messages); if (answer) yield { type: "delta" as const, text: `<think>hm</think>${answer}` }; yield { type: "done" as const }; } };

describe("compaction", () => {
  test("summarises the older part, sends the summary next turn, deletes nothing, and can be undone", async () => {
    registerEngine(engine);
    const api = chatApi(), s = createSession({ engine: engine.id, model: "m" });
    for (let i = 0; i < 4; i++) { appendMessage(s.id, { role: "user", content: `question ${i}` }); appendMessage(s.id, { role: "assistant", content: `answer ${i}` }); }
    const url = (what: string) => `/sessions/${s.id}/${what}`;
    const before = await (await api.request(url("context"))).json() as { tokens: number; messages: number; canCompact: boolean; window: unknown };
    expect(before).toMatchObject({ messages: 8, canCompact: true, window: null });
    expect(before.tokens).toBeGreaterThan(10);
    const done = await api.request(url("compact"), { method: "POST" });
    expect(done.status).toBe(200);
    expect(await done.json()).toMatchObject({ messages: 4, summary: { text: "- they chose the blue gate", covers: 4 }, canCompact: false });
    expect(getSession(s.id)!.messages.length).toBe(8);
    seen.length = 0;
    await (await api.request(url("turns"), { method: "POST", body: JSON.stringify({ content: "and now?" }) })).text();
    expect(seen[0]![0]).toEqual({ role: "system", content: "Summary of the earlier part of this conversation:\n- they chose the blue gate" });
    expect(seen[0]!.map((m) => m.content)).not.toContain("question 0");
    expect(seen[0]!.map((m) => m.content)).toContain("question 2");
    expect((await api.request(url("summary"), { method: "DELETE" })).status).toBe(200);
    expect(summaryOf(s.id)).toBeNull();
  });
  test("a short chat is refused, an empty answer saves nothing, a missing chat is 404, delete takes the summary along", async () => {
    registerEngine(engine);
    const api = chatApi(), s = createSession({ engine: engine.id, model: "m" });
    appendMessage(s.id, { role: "user", content: "hi" });
    expect((await api.request(`/sessions/${s.id}/compact`, { method: "POST" })).status).toBe(409);
    for (let i = 0; i < 4; i++) { appendMessage(s.id, { role: "assistant", content: "a" }); appendMessage(s.id, { role: "user", content: "b" }); }
    answer = "";
    expect((await api.request(`/sessions/${s.id}/compact`, { method: "POST" })).status).toBe(502);
    expect(summaryOf(s.id)).toBeNull();
    answer = "- short";
    expect((await api.request(`/sessions/${s.id}/compact`, { method: "POST" })).status).toBe(200);
    expect((await api.request(`/sessions/${s.id}`, { method: "DELETE" })).status).toBe(200);
    expect(summaryOf(s.id)).toBeNull();
    expect((await api.request(`/sessions/nope/context`)).status).toBe(404);
    unregisterEngine(engine.id);
  });
  test("the kept part starts with the person's message", () => {
    const rows = (r: string) => [...r].map((c) => ({ role: c === "u" ? "user" : "assistant" })) as never;
    expect(cutAt(rows("uauauaua"))).toBe(4);
    expect(cutAt(rows("uauaa"))).toBe(0);
    expect(cutAt(rows("uauaaaaa"))).toBe(2);
  });
});

describe("model info", () => {
  test("capabilities and sizes are read from Ollama's own answer, only for listed models", async () => {
    expect(shapeInfo("x", { capabilities: ["completion", "vision", "tools", "<b>"], model_info: { "llama.context_length": 8192 }, parameters: "stop a\nnum_ctx    4096" })).toEqual({ name: "x", capabilities: ["vision", "tools"], maxContext: 8192, setContext: 4096 });
    expect(shapeInfo("y", null)).toEqual({ name: "y", capabilities: [], maxContext: null, setContext: null });
    const asked: string[] = [];
    const info = createModelInfo({ baseUrl: () => "http://x", fetchImpl: (async (u: string, init?: { body?: string }) => { if (u.endsWith("/api/tags")) return Response.json({ models: [{ name: "a:1b" }] }); asked.push(JSON.parse(init!.body!).model); return Response.json({ capabilities: ["thinking"] }); }) as never });
    expect(await info()).toEqual([{ name: "a:1b", capabilities: ["thinking"], maxContext: null, setContext: null }]);
    await info();
    expect(asked).toEqual(["a:1b"]);
  });
});
