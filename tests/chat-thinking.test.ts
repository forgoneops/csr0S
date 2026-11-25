// Chat through the real Hono app with a fake engine adapter: sessions, one SSE stream per turn,
// honest refusals before anything is written, and a real abort that reaches the adapter.
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { EngineAdapter, EngineEvent, EngineModel } from "../core/engines";

process.env.CAESAROS_DATA = mkdtempSync(join(tmpdir(), "caesaros-chat-"));
process.env.CAESAROS_MODULE_DIRS = "plugins";

type App = { request: (path: string, init?: RequestInit) => Promise<Response>; fetch: (req: Request) => Response | Promise<Response> };
let app: App;
let registerEngine: (a: EngineAdapter) => void;
let resetEngines: () => void;

type Script = (signal: AbortSignal | undefined) => AsyncGenerator<EngineEvent>;
const state: { script: Script; models: EngineModel[]; ok: boolean; signal?: AbortSignal; seen?: unknown } = {
  script: async function* () { yield { type: "done" }; }, models: [{ id: "fake-1", label: "Fake" }], ok: true,
};
const fakeEngine: EngineAdapter = {
  id: "fake", label: "Fake engine",
  health: async () => ({ ok: state.ok, detail: state.ok ? null : "down" }),
  models: async () => state.models,
  stream: (messages, o) => { state.signal = o.signal; state.seen = messages; return state.script(o.signal); },
};

beforeAll(async () => {
  ({ app } = await import("../core/server") as unknown as { app: App });
  ({ registerEngine, resetEngines } = await import("../core/engines"));
});
beforeEach(() => {
  resetEngines(); registerEngine(fakeEngine);
  state.ok = true; state.models = [{ id: "fake-1", label: "Fake" }];
  state.script = async function* () { yield { type: "delta", text: "Hello" }; yield { type: "delta", text: " world" }; yield { type: "done" }; };
});
afterAll(() => resetEngines());

const post = (path: string, body: unknown) => app.request(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const newSession = async (extra: object = {}) => (await (await post("/api/chat/sessions", { engine: "fake", ...extra })).json()) as { id: string; title: string; model: string };

type Data = { sessionId?: string; engine?: string; model?: string; assistantMessageId?: string; userMessage?: unknown; text?: string; message?: unknown; status?: string };
type Frame = { event: string; data: Data };
const frames = (text: string): Frame[] => text.split("\n\n").filter(Boolean).map((block) => {
  const ev = /^event: (.*)$/m.exec(block)?.[1] ?? "", data = /^data: (.*)$/m.exec(block)?.[1] ?? "null";
  return { event: ev, data: JSON.parse(data) };
});


describe("reasoning is kept beside the answer", () => {
  test("a thinking event and inline <think> tags (split across chunks) reach the stream, the saved row, and never the answer", async () => {
    state.script = async function* () {
      yield { type: "thinking", text: "step one. " };
      yield { type: "delta", text: "<thi" }; yield { type: "delta", text: "nk>step two</th" }; yield { type: "delta", text: "ink>The answer" };
      yield { type: "done" };
    };
    const s = await newSession();
    const r = await post(`/api/chat/sessions/${s.id}/turns`, { content: "hi" });
    const fr = frames(await r.text());
    expect(fr.filter((f) => f.event === "thinking").map((f) => f.data.text).join("")).toBe("step one. step two");
    expect(fr.filter((f) => f.event === "delta").map((f) => f.data.text).join("")).toBe("The answer");
    const got = (await (await app.request(`/api/chat/sessions/${s.id}`)).json()) as { messages: { role: string; content: string; thinking: string }[] };
    const reply = got.messages.find((m) => m.role === "assistant")!;
    expect(reply.content).toBe("The answer");
    expect(reply.thinking).toBe("step one. step two");
    // the next turn sends the answer only, never the reasoning
    state.script = async function* () { yield { type: "delta", text: "ok" }; yield { type: "done" }; };
    await (await post(`/api/chat/sessions/${s.id}/turns`, { content: "again" })).text();
    expect(JSON.stringify(state.seen)).not.toContain("step one");
  });
});

describe("tool calls are one row each", () => {
  test("a call updates in place, gets a measured time, and one left open ends as failed; runaway calls are capped", async () => {
    state.script = async function* () {
      yield { type: "tool", call: { id: "t1", name: "read_file", status: "running", input: "{\"path\":\"a.txt\"}" } };
      await Bun.sleep(15);
      yield { type: "tool", call: { id: "t1", name: "read_file", status: "ok", output: "x".repeat(5000) } };
      yield { type: "tool", call: { id: "t2", name: "send_mail", status: "waiting", approvalId: "ap-1" } };
      for (let i = 0; i < 60; i++) yield { type: "tool", call: { id: `n${i}`, name: "noise", status: "ok" } };
      yield { type: "delta", text: "done" }; yield { type: "done" };
    };
    const s = await newSession();
    const fr = frames(await (await post(`/api/chat/sessions/${s.id}/turns`, { content: "go" })).text());
    expect(fr.filter((f) => f.event === "tool").length).toBeGreaterThan(2);
    const got = (await (await app.request(`/api/chat/sessions/${s.id}`)).json()) as { messages: { role: string; tools: { id: string; status: string; ms?: number; output?: string; approvalId?: string }[] }[] };
    const tools = got.messages.find((m) => m.role === "assistant")!.tools;
    expect(tools.filter((t) => t.id === "t1")).toHaveLength(1);
    const t1 = tools.find((t) => t.id === "t1")!;
    expect(t1.status).toBe("ok"); expect(t1.ms).toBeGreaterThanOrEqual(10); expect(t1.output!.length).toBeLessThan(4100);
    const t2 = tools.find((t) => t.id === "t2")!;
    expect(t2.status).toBe("error"); expect(t2.approvalId).toBe("ap-1");     // still waiting when the turn ended
    expect(tools.length).toBe(50);
  });
});

describe("use my knowledge", () => {
  test("the best passages ride along as a system note and come back as numbered sources; off by default", async () => {
    const { addDoc } = await import("../core/knowledge");
    addDoc("Garden notes", "Tomatoes need six hours of sun and regular water. Basil grows next to tomatoes.");
    state.script = async function* () { yield { type: "delta", text: "Six hours [1]" }; yield { type: "done" }; };
    const s = await newSession();
    const fr = frames(await (await post(`/api/chat/sessions/${s.id}/turns`, { content: "how much sun do tomatoes need", useKnowledge: true })).text());
    const src = fr.find((f) => f.event === "sources")!.data as unknown as { n: number; name: string }[];
    expect(src[0]).toMatchObject({ n: 1, name: "Garden notes" });
    const seen = state.seen as { role: string; content: string }[];
    expect(seen[0].role).toBe("system"); expect(seen[0].content).toContain("[1] (Garden notes)");
    const saved = (await (await app.request(`/api/chat/sessions/${s.id}`)).json()) as { messages: { role: string; sources: unknown[] }[] };
    expect(saved.messages.find((m) => m.role === "assistant")!.sources).toHaveLength(1);
    // off: no search, no note, no sources event
    const fr2 = frames(await (await post(`/api/chat/sessions/${s.id}/turns`, { content: "tomatoes again" })).text());
    expect(fr2.some((f) => f.event === "sources")).toBe(false);
    expect((state.seen as { role: string }[]).some((m) => m.role === "system")).toBe(false);
  });
});

describe("attachments on a turn", () => {
  test("a text file is read by the engine and kept for later turns; an image reaches a vision engine; refusals write nothing", async () => {
    const s = await newSession();
    const text = { name: "plan.md", mime: "text/markdown", data: "Step one: water the basil." };
    await (await post(`/api/chat/sessions/${s.id}/turns`, { content: "summarise", attachments: [text] })).text();
    expect((state.seen as { content: string }[]).at(-1)!.content).toContain("[Attached file: plan.md]");
    await (await post(`/api/chat/sessions/${s.id}/turns`, { content: "and now?" })).text();
    expect(JSON.stringify(state.seen)).toContain("water the basil");                 // the file is still in the history
    const saved = (await (await app.request(`/api/chat/sessions/${s.id}`)).json()) as { messages: { role: string; content: string; attachments: { name: string }[] }[] };
    expect(saved.messages[0].content).toBe("summarise"); expect(saved.messages[0].attachments[0].name).toBe("plan.md");
    // an image to an engine that cannot take images is refused before anything is written
    const before = saved.messages.length;
    const refused = await post(`/api/chat/sessions/${s.id}/turns`, { content: "look", attachments: [{ name: "a.png", mime: "image/png", data: Buffer.alloc(20, 1).toString("base64") }] });
    expect(refused.status).toBe(409); expect(await refused.json()).toMatchObject({ why: "no-vision" });
    const pdf = await post(`/api/chat/sessions/${s.id}/turns`, { content: "read", attachments: [{ name: "a.pdf", mime: "application/pdf", data: "JVBERi0=" }] });
    expect(pdf.status).toBe(400);
    const after = (await (await app.request(`/api/chat/sessions/${s.id}`)).json()) as { messages: unknown[] };
    expect(after.messages.length).toBe(before);
  });
});

