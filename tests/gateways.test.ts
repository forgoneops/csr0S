// R44 gateway registry: URL hygiene, add and remove rules, a bounded probe that refuses redirects, and
// the HTTP routes on the real core with no network involved.
import { describe, expect, test } from "bun:test";
import { addGateway, cleanUrl, probe, removeGateway, type Gateway } from "../core/gateways";

const gw = (o: Partial<Gateway> = {}): Gateway => ({ id: "vps", name: "VPS", url: "https://a.example", kind: "vps", ...o });
const reply = (body: unknown, init: ResponseInit = {}) => (async () => new Response(typeof body === "string" ? body : JSON.stringify(body), init)) as unknown as typeof fetch;

describe("cleanUrl", () => {
  test("keeps origin and path, drops the trailing slash", () => {
    expect(cleanUrl("https://a.example/")).toEqual({ url: "https://a.example" });
    expect(cleanUrl(" http://100.1.2.3:4410/base/ ")).toEqual({ url: "http://100.1.2.3:4410/base" });
  });
  test("refuses other schemes, credentials, query and fragment, junk and empty", () => {
    expect(cleanUrl("file:///etc/passwd")).toEqual({ error: "url_scheme" });
    expect(cleanUrl("javascript:alert(1)")).toEqual({ error: "url_scheme" });
    expect(cleanUrl("https://u:p@example.com")).toEqual({ error: "url_credentials" });
    expect(cleanUrl("https://a.example/?k=v")).toEqual({ error: "url_extras" });
    expect(cleanUrl("https://a.example/#x")).toEqual({ error: "url_extras" });
    expect(cleanUrl("not a url")).toEqual({ error: "url_invalid" });
    expect(cleanUrl("")).toEqual({ error: "url_required" });
    expect(cleanUrl(42)).toEqual({ error: "url_required" });
  });
});

describe("addGateway / removeGateway", () => {
  test("adds with a unique id and picks the kind from the host", () => {
    const a = addGateway([], { name: "My VPS", url: "https://a.example" });
    expect("list" in a && a.list[0]).toEqual({ id: "my-vps", name: "My VPS", url: "https://a.example", kind: "vps" });
    const b = addGateway((a as { list: Gateway[] }).list, { name: "My VPS", url: "https://b.example" });
    expect("list" in b && b.list.map((g) => g.id)).toEqual(["my-vps", "my-vps-2"]);
    const l = addGateway([], { name: "Other port", url: "http://127.0.0.1:4411" });
    expect("list" in l && l.list[0].kind).toBe("local");
  });
  test("a name that starts with a digit still gets a valid id", () => {
    const r = addGateway([], { name: "7 hills", url: "https://a.example" });
    expect("list" in r && /^[a-z][a-z0-9-]*$/.test(r.list[0].id)).toBe(true);
  });
  test("refuses empty name, duplicate url and a ninth entry", () => {
    expect(addGateway([], { name: " ", url: "https://a.example" })).toEqual({ error: "name_required" });
    expect(addGateway([gw()], { name: "Again", url: "https://a.example/" })).toEqual({ error: "url_duplicate" });
    const eight = Array.from({ length: 8 }, (_, i) => gw({ id: `g${i}`, url: `https://${i}.example` }));
    expect(addGateway(eight, { name: "Nine", url: "https://9.example" })).toEqual({ error: "too_many" });
  });
  test("remove drops only that id", () => {
    expect(removeGateway([gw({ id: "a" }), gw({ id: "b" })], "a").map((g) => g.id)).toEqual(["b"]);
  });
});

describe("probe", () => {
  test("a CaesarOS answers ok with its version and a latency", async () => {
    const h = await probe(gw(), reply({ ok: true, name: "CaesarOS", version: "0.1.0" }, { headers: { "content-type": "application/json" } }));
    expect(h).toMatchObject({ id: "vps", ok: true, status: 200, version: "0.1.0", error: null });
    expect(typeof h.latencyMs).toBe("number");
  });
  test("a redirect is refused, never followed", async () => {
    const h = await probe(gw(), reply("", { status: 302, headers: { location: "https://evil.example" } }));
    expect(h).toMatchObject({ ok: false, status: 302, error: "redirect_refused" });
  });
  test("some other server, an error status, and a huge body are not a CaesarOS", async () => {
    expect((await probe(gw(), reply({ ok: true, name: "Other" }))).error).toBe("not_caesaros");
    expect((await probe(gw(), reply("<html>", {}))).error).toBe("not_caesaros");
    expect((await probe(gw(), reply("x", { status: 503 }))).error).toBe("http_503");
    expect((await probe(gw(), reply("x", { headers: { "content-length": String(10 * 1024 * 1024) } }))).error).toBe("too_large");
  });
  test("timeout and unreachable are told apart, and the fetch is bounded by a signal", async () => {
    let signal: AbortSignal | undefined;
    const slow = (async (_u: unknown, init?: RequestInit) => { signal = init?.signal ?? undefined; const e = new Error("t"); e.name = "TimeoutError"; throw e; }) as unknown as typeof fetch;
    expect((await probe(gw(), slow)).error).toBe("timeout");
    expect(signal).toBeDefined();
    const down = (async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch;
    expect((await probe(gw(), down)).error).toBe("unreachable");
  });
});

describe("routes on the real core", () => {
  type App = { request: (path: string, init?: RequestInit) => Promise<Response> };
  const boot = async () => {
    const { mkdtempSync } = await import("node:fs"), { tmpdir } = await import("node:os"), { join } = await import("node:path");
    process.env.CAESAROS_DATA = mkdtempSync(join(tmpdir(), "caesaros-gw-"));
    process.env.CAESAROS_MODULE_DIRS = "plugins";
    return (await import("../core/server") as unknown as { app: App }).app;
  };
  const json = (body: unknown): RequestInit => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  test("fresh install lists only This device; add, list, remove round-trip; bad input is 400", async () => {
    const app = await boot();
    const first = await (await app.request("/api/gateways")).json() as { thisDevice: { id: string }; gateways: unknown[] };
    expect(first.thisDevice.id).toBe("this-device");
    expect(first.gateways).toEqual([]);

    expect((await app.request("/api/gateways", json({ name: "VPS", url: "ftp://x" }))).status).toBe(400);
    const add = await app.request("/api/gateways", json({ name: "VPS", url: "https://a.example" }));
    expect(add.status).toBe(201);
    const made = await add.json() as { id: string };
    expect(((await (await app.request("/api/gateways")).json()) as { gateways: unknown[] }).gateways).toHaveLength(1);

    // this device answers without any network; an unknown id is 404
    expect(((await (await app.request("/api/gateways/this-device/health")).json()) as { ok: boolean }).ok).toBe(true);
    expect((await app.request("/api/gateways/nope/health")).status).toBe(404);

    // removing the only vps gateway drops an engine that pointed at it back to local
    await app.request("/api/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ engine: "vps" }) });
    expect((await app.request(`/api/gateways/${made.id}`, { method: "DELETE" })).status).toBe(200);
    expect(((await (await app.request("/api/settings")).json()) as { engine: string }).engine).toBe("local");
    expect((await app.request(`/api/gateways/${made.id}`, { method: "DELETE" })).status).toBe(404);
  });
});

describe("capsule naming", () => {
  test("the engine chip names a gateway only for the remote route, never for local", async () => {
    const src = await Bun.file(new URL("../web/src/shell/Capsule.tsx", import.meta.url)).text();
    expect(src).toContain('settings.engine === "vps" ? settings.gateways.find((g) => g.kind === "vps")?.name : undefined');
  });
});

describe("probe body cap without a Content-Length", () => {
  const stream = (chunks: string[], hang = false) => (async () => new Response(new ReadableStream({ async start(c) { for (const ch of chunks) c.enqueue(new TextEncoder().encode(ch)); if (!hang) c.close(); } }))) as unknown as typeof fetch;
  test("a body that streams past the cap is refused and never fully read", async () => {
    const big = "x".repeat(40 * 1024);
    expect((await probe(gw(), stream([big, big, big]))).error).toBe("too_large");
    expect((await probe(gw(), stream([big, big], true))).error).toBe("too_large");          // an endless stream is cut at the cap
  });
  test("a small valid answer that arrives in several chunks still works", async () => {
    const h = await probe(gw(), stream(['{"ok":true,', '"name":"CaesarOS",', '"version":"0.9.0"}']));
    expect(h).toMatchObject({ ok: true, version: "0.9.0" });
  });
});
