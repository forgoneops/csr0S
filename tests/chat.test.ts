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

describe("chat sessions", () => {
  test("create, list newest first, and get with ordered messages", async () => {
    const a = await newSession({ title: "first" });
    await Bun.sleep(3);
    const b = await newSession();
    expect(b.title).toBe("");
    const list = (await (await app.request("/api/chat/sessions")).json()) as { id: string }[];
    expect(list.map((s) => s.id).slice(0, 2)).toEqual([b.id, a.id]);
    const got = await app.request(`/api/chat/sessions/${a.id}`);
    expect(got.status).toBe(200);
    expect(await got.json()).toMatchObject({ session: { id: a.id, title: "first", engine: "fake" }, messages: [] });
    expect((await app.request("/api/chat/sessions/nope")).status).toBe(404);
  });

  test("a missing engine is 400 and an unknown engine is 400", async () => {
    expect((await post("/api/chat/sessions", {})).status).toBe(400);
    const r = await post("/api/chat/sessions", { engine: "ghost" });
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: "unknown engine" });
  });
});

describe("chat turns", () => {
  test("a turn streams meta, deltas and done, and persists both messages", async () => {
    const s = await newSession();
    const r = await post(`/api/chat/sessions/${s.id}/turns`, { content: "  Say hello  " });
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("text/event-stream");
    const f = frames(await r.text());
    expect(f.map((x) => x.event)).toEqual(["meta", "delta", "delta", "done"]);
    expect(f[0].data).toMatchObject({ sessionId: s.id, engine: "fake", model: "fake-1", userMessage: { role: "user", content: "Say hello" } });
    expect(f[1].data).toEqual({ text: "Hello" });
    expect(f[3].data.status).toBe("complete");
    expect(f[3].data.message).toMatchObject({ id: f[0].data.assistantMessageId, role: "assistant", content: "Hello world", status: "complete" });

    const got = (await (await app.request(`/api/chat/sessions/${s.id}`)).json()) as { session: { title: string; model: string }; messages: { role: string; content: string; status: string }[] };
    expect(got.messages.map((m) => [m.role, m.content, m.status])).toEqual([["user", "Say hello", "complete"], ["assistant", "Hello world", "complete"]]);
    expect(got.session.title).toBe("Say hello");
    expect(got.session.model).toBe("fake-1");
  });

  test("the title is the first 60 characters, and earlier turns are sent as history", async () => {
    const s = await newSession();
    await (await post(`/api/chat/sessions/${s.id}/turns`, { content: "x".repeat(90) })).text();
    await (await post(`/api/chat/sessions/${s.id}/turns`, { content: "again" })).text();
    const got = (await (await app.request(`/api/chat/sessions/${s.id}`)).json()) as { session: { title: string } };
    expect(got.session.title).toBe("x".repeat(60));
    expect(state.seen).toEqual([
      { role: "user", content: "x".repeat(90) }, { role: "assistant", content: "Hello world" }, { role: "user", content: "again" },
    ]);
  });

  test("an adapter that throws mid-stream yields error then done 'error', keeping the partial text", async () => {
    state.script = async function* () { yield { type: "delta", text: "part" }; throw new Error("engine stopped answering"); };
    const s = await newSession();
    const f = frames(await (await post(`/api/chat/sessions/${s.id}/turns`, { content: "go" })).text());
    expect(f.map((x) => x.event)).toEqual(["meta", "delta", "error", "done"]);
    expect(f[2].data).toEqual({ message: "engine stopped answering" });
    expect(f[3].data.status).toBe("error");
    const got = (await (await app.request(`/api/chat/sessions/${s.id}`)).json()) as { messages: { content: string; status: string; error: string | null }[] };
    expect(got.messages[1]).toMatchObject({ content: "part", status: "error", error: "engine stopped answering" });
  });

  test("no model connected is 409 no-model and nothing is persisted", async () => {
    state.models = [];
    const s = await newSession();
    const r = await post(`/api/chat/sessions/${s.id}/turns`, { content: "hi" });
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ error: "no-model" });
    const got = (await (await app.request(`/api/chat/sessions/${s.id}`)).json()) as { session: { title: string }; messages: unknown[] };
    expect(got.messages).toEqual([]);
    expect(got.session.title).toBe("");
  });

  test("an engine that is not answering is 409 engine-unavailable; bad input is 404 and 400", async () => {
    const s = await newSession();
    state.ok = false;
    const r = await post(`/api/chat/sessions/${s.id}/turns`, { content: "hi" });
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ error: "engine-unavailable" });
    state.ok = true;
    expect((await post(`/api/chat/sessions/${s.id}/turns`, { content: "   " })).status).toBe(400);
    expect((await post("/api/chat/sessions/missing/turns", { content: "hi" })).status).toBe(404);
  });
});

describe("engines and approvals", () => {
  test("GET /api/engines reports health and models only for an engine that answers", async () => {
    const body = (await (await app.request("/api/engines")).json()) as { engines: { id: string; health: { ok: boolean }; models: unknown[] }[] };
    expect(body.engines.find((e) => e.id === "fake")).toMatchObject({ health: { ok: true, detail: null }, models: [{ id: "fake-1", label: "Fake" }] });
    state.ok = false;
    const down = (await (await app.request("/api/engines")).json()) as typeof body;
    expect(down.engines.find((e) => e.id === "fake")).toMatchObject({ health: { ok: false, detail: "down" }, models: [] });
  });

  test("a models() failure does not 500 the route", async () => {
    registerEngine({ ...fakeEngine, id: "flaky", models: async () => { throw new Error("boom"); } });
    const r = await app.request("/api/engines");
    expect(r.status).toBe(200);
    const body = (await r.json()) as { engines: { id: string; health: { ok: boolean }; models: unknown[] }[] };
    expect(body.engines.find((e) => e.id === "flaky")).toMatchObject({ health: { ok: true }, models: [] });
  });

  test("approvals are an empty list on a fresh install", async () => {
    const r = await app.request("/api/approvals");
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ pending: [] });
  });
});

describe("stop", () => {
  let server: ReturnType<typeof Bun.serve>;
  beforeAll(() => { server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: (req) => app.fetch(req) }); });
  afterAll(() => { server.stop(true); });

  test("aborting the request aborts the adapter and stores the partial reply as 'stopped'", async () => {
    state.script = async function* (signal) {
      yield { type: "delta", text: "first " };
      await new Promise<void>((resolve) => { if (signal?.aborted) resolve(); else signal?.addEventListener("abort", () => resolve()); });
      yield { type: "delta", text: "never stored" };
    };
    const base = `http://127.0.0.1:${server.port}`;
    const s = await (await fetch(`${base}/api/chat/sessions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ engine: "fake" }) })).json() as { id: string };
    const ac = new AbortController();
    const r = await fetch(`${base}/api/chat/sessions/${s.id}/turns`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content: "stop me" }), signal: ac.signal });
    const reader = r.body!.getReader();
    let text = "";
    while (!text.includes("event: delta")) { const { value, done } = await reader.read(); if (done) break; text += new TextDecoder().decode(value); }
    ac.abort();
    await reader.read().catch(() => {});

    for (let i = 0; i < 50 && !state.signal?.aborted; i++) await Bun.sleep(20);
    expect(state.signal?.aborted).toBe(true);
    let row: { status: string; content: string } | undefined;
    for (let i = 0; i < 50 && !row; i++) {
      const got = (await (await app.request(`/api/chat/sessions/${s.id}`)).json()) as { messages: { role: string; status: string; content: string }[] };
      row = got.messages.find((m) => m.role === "assistant");
      if (!row) await Bun.sleep(20);
    }
    expect(row).toMatchObject({ status: "stopped", content: "first " });
  });
});

describe("archive", () => {
  test("an archived conversation leaves the default list, shows in the archived list and can come back", async () => {
    const made = await newSession();
    const patch = (b: unknown) => app.request(`/api/chat/sessions/${made.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
    const ids = async (q = "") => ((await (await app.request(`/api/chat/sessions${q}`)).json()) as { id: string }[]).map((x) => x.id);
    expect(await ids()).toContain(made.id);
    expect((await patch({ archived: true })).status).toBe(200);
    expect(await ids()).not.toContain(made.id);
    expect(await ids("?archived=1")).toContain(made.id);
    expect((await patch({ archived: false })).status).toBe(200);
    expect(await ids()).toContain(made.id);
  });
});
