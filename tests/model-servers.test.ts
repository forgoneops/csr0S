// R47 model servers: an OpenAI-compatible adapter against a real local SSE server, the add/remove rules,
// and the guarantee that a stored address cannot be anything but http(s), however it arrives.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createOpenAiCompatEngine, normalizeBase, parseSseLine } from "../core/engines/openai-compat";
import { addServer } from "../core/model-servers";

let server: ReturnType<typeof Bun.serve>;
let base = "";
let lastBody: { model?: string; messages?: unknown[]; stream?: boolean } = {};

const sse = (lines: string[], opts: { hang?: boolean } = {}) => {
  const enc = new TextEncoder();
  return new Response(new ReadableStream({
    async start(ctl) {
      for (const l of lines) ctl.enqueue(enc.encode(l + "\n\n"));
      if (!opts.hang) ctl.close();
    },
  }), { headers: { "content-type": "text/event-stream" } });
};

beforeAll(() => {
  server = Bun.serve({
    port: 0, hostname: "127.0.0.1",
    async fetch(req) {
      const u = new URL(req.url);
      if (u.pathname === "/v1/models") return Response.json({ data: [{ id: "tiny-1" }, { id: "tiny-2" }, {}] });
      if (u.pathname === "/v1/chat/completions") {
        lastBody = await req.json() as typeof lastBody;
        if (lastBody.model === "boom") return new Response('{"error":"model not loaded"}', { status: 500 });
        if (lastBody.model === "cut") return sse([`data: {"choices":[{"delta":{"content":"par"}}]}`]);          // ends without [DONE]
        if (lastBody.model === "hang") return sse([`data: {"choices":[{"delta":{"content":"one"}}]}`], { hang: true });
        return sse([
          `: keep-alive comment`,
          `data: {"choices":[{"delta":{"role":"assistant"}}]}`,
          `data: {"choices":[{"delta":{"content":"Hel"}}]}`,
          `data: not json at all`,
          `data: {"choices":[{"delta":{"content":"lo"}}]}`,
          `data: {"choices":[{"delta":{},"finish_reason":"stop"}]}`,
          `data: [DONE]`,
        ]);
      }
      return new Response("nope", { status: 404 });
    },
  });
  base = `http://127.0.0.1:${server.port}`;
});
afterAll(() => server.stop(true));

const collect = async (it: AsyncIterable<{ type: string; text?: string }>) => { const out: string[] = []; for await (const e of it) out.push(e.type === "delta" ? e.text! : e.type); return out; };
const engine = () => createOpenAiCompatEngine({ id: "server-t", label: "Test", baseUrl: base });
const msgs = [{ role: "user" as const, content: "hi" }];

describe("normalizeBase / parseSseLine", () => {
  test("drops trailing slash and /v1, adds http:// to a bare host", () => {
    expect(normalizeBase("http://a:1/v1/")).toBe("http://a:1");
    expect(normalizeBase("a:1234")).toBe("http://a:1234");
    expect(normalizeBase("https://x.example/base/")).toBe("https://x.example/base");
  });
  test("comments and junk are skipped, [DONE] ends, an error object throws", () => {
    expect(parseSseLine(": hi")).toEqual({ events: [], done: false });
    expect(parseSseLine("data: junk")).toEqual({ events: [], done: false });
    expect(parseSseLine("data: [DONE]")).toEqual({ events: [{ type: "done" }], done: true });
    expect(() => parseSseLine('data: {"error":{"message":"bad"}}')).toThrow("bad");
  });
});

describe("the adapter against a real SSE server", () => {
  test("health is ok and models are listed, entries without an id dropped", async () => {
    expect(await engine().health()).toEqual({ ok: true, detail: null });
    expect((await engine().models()).map((m) => m.id)).toEqual(["tiny-1", "tiny-2"]);
  });
  test("health says why when nothing answers", async () => {
    const dead = createOpenAiCompatEngine({ id: "server-x", label: "X", baseUrl: "http://127.0.0.1:1" });
    expect(await dead.health()).toEqual({ ok: false, detail: "not answering" });
    await expect(dead.models()).rejects.toThrow("X is not answering");
  });
  test("streams deltas in order and ends with done; sends model, messages and stream:true", async () => {
    expect(await collect(engine().stream(msgs, { model: "tiny-1" }))).toEqual(["Hel", "lo", "done"]);
    expect(lastBody).toMatchObject({ model: "tiny-1", stream: true, messages: msgs });
  });
  test("an error status carries the server's words", async () => {
    await expect(collect(engine().stream(msgs, { model: "boom" }))).rejects.toThrow(/answered 500.*model not loaded/);
  });
  test("a body that ends before [DONE] is an error, not a finished answer", async () => {
    await expect(collect(engine().stream(msgs, { model: "cut" }))).rejects.toThrow("engine stopped answering");
  });
  test("aborting mid-stream stops quietly without an error", async () => {
    const ac = new AbortController();
    const got: string[] = [];
    for await (const e of engine().stream(msgs, { model: "hang", signal: ac.signal })) { if (e.type === "delta") { got.push(e.text); ac.abort(); } }
    expect(got).toEqual(["one"]);
  });
});

describe("addServer", () => {
  test("normalises the address, makes a unique id, refuses bad input", () => {
    const a = addServer([], { name: "LM Studio", url: "localhost:1234" });
    expect("list" in a && a.list[0]).toEqual({ id: "lm-studio", name: "LM Studio", url: "http://localhost:1234" });
    expect(addServer([], { name: "", url: "http://a" })).toEqual({ error: "name_required" });
    expect(addServer([], { name: "x", url: "ftp://a" })).toEqual({ error: "url_scheme" });
    expect(addServer([{ id: "a", name: "A", url: "http://a" }], { name: "B", url: "http://a/" })).toEqual({ error: "url_duplicate" });
    const four = [1, 2, 3, 4].map((n) => ({ id: `s${n}`, name: `S${n}`, url: `http://h${n}` }));
    expect(addServer(four, { name: "Five", url: "http://h5" })).toEqual({ error: "too_many" });
  });
});

describe("on the real core", () => {
  type App = { request: (path: string, init?: RequestInit) => Promise<Response> };
  const jsonInit = (method: string, body?: unknown): RequestInit => ({ method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

  test("a server added over the API shows up as an engine with its models, and leaves when removed", async () => {
    const { mkdtempSync } = await import("node:fs"), { tmpdir } = await import("node:os"), { join } = await import("node:path");
    process.env.CAESAROS_DATA = mkdtempSync(join(tmpdir(), "caesaros-ms-"));
    process.env.CAESAROS_MODULE_DIRS = "plugins";
    const { app } = await import("../core/server") as unknown as { app: App };

    const add = await app.request("/api/model-servers", jsonInit("POST", { name: "Local test", url: base }));
    expect(add.status).toBe(201);
    const made = await add.json() as { id: string };
    const eng = await (await app.request("/api/engines")).json() as { engines: { id: string; health: { ok: boolean }; models: { id: string }[] }[] };
    const mine = eng.engines.find((e) => e.id === `server-${made.id}`);
    expect(mine?.health.ok).toBe(true);
    expect(mine?.models.map((m) => m.id)).toEqual(["tiny-1", "tiny-2"]);

    expect((await app.request(`/api/model-servers/${made.id}`, jsonInit("DELETE"))).status).toBe(200);
    const after = await (await app.request("/api/engines")).json() as { engines: { id: string }[] };
    expect(after.engines.some((e) => e.id === `server-${made.id}`)).toBe(false);
  });

  test("a stored address cannot be anything but http(s): PUT /api/settings refuses file:// and credentials", async () => {
    const { app } = await import("../core/server") as unknown as { app: App };
    for (const url of ["file:///etc/passwd", "https://u:p@example.com", "javascript:1"]) {
      const r = await app.request("/api/settings", jsonInit("PUT", { modelServers: [{ id: "x", name: "X", url }] }));
      expect(r.status).toBe(400);
      const g = await app.request("/api/settings", jsonInit("PUT", { gateways: [{ id: "x", name: "X", url, kind: "vps" }] }));
      expect(g.status).toBe(400);
    }
  });
});

describe("API keys for model servers", () => {
  test("the key goes to the configured server as a bearer token on every request kind, read per request", async () => {
    const seen: string[] = [];
    const guarded = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch(req) {
      seen.push(`${new URL(req.url).pathname}:${req.headers.get("authorization")}`);
      if (req.headers.get("authorization") !== "Bearer s3cret-key") return new Response("no", { status: 401 });
      const u = new URL(req.url);
      if (u.pathname === "/v1/models") return Response.json({ data: [{ id: "m" }] });
      return sse([`data: {"choices":[{"delta":{"content":"ok"}}]}`, "data: [DONE]"]);
    } });
    try {
      let key: string | undefined = undefined;
      const eng = createOpenAiCompatEngine({ id: "server-k", label: "K", baseUrl: `http://127.0.0.1:${guarded.port}`, apiKey: () => key });
      expect((await eng.health()).ok).toBe(false);                                // no key: the server says 401
      key = "s3cret-key";
      expect(await eng.health()).toEqual({ ok: true, detail: null });             // the new key is used at once
      expect((await eng.models()).map((m) => m.id)).toEqual(["m"]);
      expect(await collect(eng.stream(msgs, { model: "m" }))).toEqual(["ok", "done"]);
      expect(seen.filter((s) => s.endsWith("Bearer s3cret-key")).length).toBe(3);
    } finally { guarded.stop(true); }
  });

  test("a redirect is refused while a key is attached, so the key cannot be forwarded elsewhere", async () => {
    let leaked = false;
    const other = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch(req) { if (req.headers.get("authorization")) leaked = true; return Response.json({ data: [] }); } });
    const redirector = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response(null, { status: 302, headers: { location: `http://127.0.0.1:${other.port}/v1/models` } }) });
    try {
      const eng = createOpenAiCompatEngine({ id: "server-r", label: "R", baseUrl: `http://127.0.0.1:${redirector.port}`, apiKey: () => "s3cret-key" });
      expect((await eng.health()).ok).toBe(false);
      expect(leaked).toBe(false);
    } finally { redirector.stop(true); other.stop(true); }
  });

  type App = { request: (path: string, init?: RequestInit) => Promise<Response> };
  const j = (method: string, body?: unknown): RequestInit => ({ method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  test("on the core: the key is stored apart, never returned, validated, replaceable, and dropped with the server", async () => {
    const { mkdtempSync } = await import("node:fs"), { tmpdir } = await import("node:os"), { join } = await import("node:path");
    process.env.CAESAROS_DATA ??= mkdtempSync(join(tmpdir(), "caesaros-mk-")); process.env.CAESAROS_MODULE_DIRS = "plugins";
    const { app } = await import("../core/server") as unknown as { app: App };
    const guarded = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: (req) => req.headers.get("authorization") === "Bearer abc123" ? Response.json({ data: [{ id: "m1" }] }) : new Response("no", { status: 401 }) });
    try {
      const url = `http://127.0.0.1:${guarded.port}`;
      expect((await app.request("/api/model-servers", j("POST", { name: "Bad key", url, key: "has space" }))).status).toBe(400);
      expect((await app.request("/api/model-servers", j("POST", { name: "Bad key", url, key: "line\nbreak" }))).status).toBe(400);
      const made = await app.request("/api/model-servers", j("POST", { name: "Guarded", url, key: "wrong" }));
      expect(made.status).toBe(201);
      const row = await made.json() as { id: string; hasKey: boolean };
      expect(row.hasKey).toBe(true);
      expect(JSON.stringify(row)).not.toContain("wrong");

      // the key is nowhere in what the API returns
      for (const path of ["/api/model-servers", "/api/settings", "/api/engines", "/api/detect"]) expect(await (await app.request(path)).text()).not.toContain("wrong");

      const engines = async () => (await (await app.request("/api/engines")).json() as { engines: { id: string; health: { ok: boolean } }[] }).engines.find((e) => e.id === `server-${row.id}`)!;
      expect((await engines()).health.ok).toBe(false);                               // wrong key: 401
      expect((await app.request(`/api/model-servers/${row.id}/key`, j("PUT", { key: "abc123" }))).status).toBe(200);
      expect((await engines()).health.ok).toBe(true);                                // replaced, no restart
      expect((await app.request(`/api/model-servers/nope/key`, j("PUT", { key: "abc123" }))).status).toBe(404);
      expect((await app.request(`/api/model-servers/${row.id}/key`, j("PUT", { key: "bad key" }))).status).toBe(400);
      expect(((await (await app.request(`/api/model-servers/${row.id}/key`, j("PUT", { key: "" }))).json()) as { hasKey: boolean }).hasKey).toBe(false);
      expect((await engines()).health.ok).toBe(false);                               // cleared

      await app.request(`/api/model-servers/${row.id}/key`, j("PUT", { key: "abc123" }));
      expect((await app.request(`/api/model-servers/${row.id}`, j("DELETE"))).status).toBe(200);
      const again = await (await app.request("/api/model-servers", j("POST", { name: "Guarded", url, key: "" }))).json() as { id: string; hasKey: boolean };
      expect(again.id).toBe(row.id);
      expect(again.hasKey).toBe(false);                                              // a re-added server does not inherit the old key
    } finally { guarded.stop(true); }
  });
});
