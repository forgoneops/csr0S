// Business, Fleet and Leads: empty at start, the rules each one keeps, and that none of them can send anything.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Hono } from "hono";

const DIR = `/tmp/caesaros-biz-${process.pid}`;
process.env.CAESAROS_DATA = DIR;
process.env.CAESAROS_MODULE_DIRS = "plugins";
process.env.CAESAROS_EDITION = "standard";

let app: Hono, plugins: Awaited<ReturnType<typeof import("../core/plugins").loadPlugins>>;
const j = (path: string, method = "GET", body?: unknown) => app.request(path, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
beforeAll(async () => { app = new Hono(); plugins = await (await import("../core/plugins")).loadPlugins(app, []); });
afterAll(() => {});

describe("start empty, with a switch", () => {
  test("all three start with nothing and can be switched off and on", async () => {
    for (const [id, path] of [["business", "reach"], ["fleet", "servers"], ["leads", "leads"]]) {
      expect(await (await j(`/api/p/${id}/${path}`)).json()).toEqual([]);
      expect(plugins.setEnabled(id!, false)).toBe("now");
      expect((await j(`/api/p/${id}/${path}`)).status).toBe(404);
      expect(plugins.setEnabled(id!, true)).toBe("now");
    }
  });
});

describe("business reach", () => {
  test("records numbers, refuses a bad one, removes one", async () => {
    expect((await j("/api/p/business/reach", "POST", { label: "Visits", value: -1 })).status).toBe(400);
    expect((await j("/api/p/business/reach", "POST", { label: " ", value: 3 })).status).toBe(400);
    const p = await (await j("/api/p/business/reach", "POST", { label: "Visits", value: 120 })).json() as { id: string };
    expect(((await (await j("/api/p/business/reach")).json()) as unknown[]).length).toBe(1);
    await j(`/api/p/business/reach/${p.id}`, "DELETE");
    expect(await (await j("/api/p/business/reach")).json()).toEqual([]);
  });
});

describe("fleet", () => {
  test("only a plain http(s) address is kept, trimmed to its origin", async () => {
    const { cleanUrl } = await import("../plugins/fleet/server");
    expect(cleanUrl("https://a.example/x?y=1")).toBe("https://a.example");
    expect(cleanUrl("ftp://a.example")).toBeNull();
    expect(cleanUrl("https://user:secret" + String.fromCharCode(64) + "a.example")).toBeNull();
    expect(cleanUrl("not a url")).toBeNull();
  });
  test("a reachable server reports disk, memory and load; a dead one says so", async () => {
    const up = Bun.serve({ port: 0, fetch: (r) => new URL(r.url).pathname === "/api/p/fleet/self" ? Response.json({ version: "9.9", diskPct: 41, memPct: 30, load: 0.2 }) : new Response("no", { status: 404 }) });
    const url = `http://127.0.0.1:${up.port}`;
    expect((await j("/api/p/fleet/servers", "POST", { name: "Up", url })).status).toBe(201);
    expect((await j("/api/p/fleet/servers", "POST", { name: "Dup", url })).status).toBe(409);
    expect((await j("/api/p/fleet/servers", "POST", { name: "Dead", url: "http://127.0.0.1:1" })).status).toBe(201);
    const rows = await (await j("/api/p/fleet/status")).json() as { name: string; reachable: boolean; version?: string; diskPct?: number }[];
    expect(rows.find((r) => r.name === "Up")).toMatchObject({ reachable: true, version: "9.9", diskPct: 41 });
    expect(rows.find((r) => r.name === "Dead")?.reachable).toBe(false);
    up.stop(true);
  });
  test("it has no route that changes a server", async () => {
    expect((await j("/api/p/fleet/status", "POST")).status).toBe(404);
  });
});

describe("leads", () => {
  test("a yes needs a draft, a draft needs no model, and nothing can be sent", async () => {
    const l = await (await j("/api/p/leads/leads", "POST", { name: "Baker", site: "baker.example", by: "scout" })).json() as { id: string; stage: string };
    expect(l.stage).toBe("scouted");
    expect((await j(`/api/p/leads/leads/${l.id}/approve`, "POST")).status).toBe(409);
    expect((await j(`/api/p/leads/leads/${l.id}`, "PATCH", { score: 140 })).status).toBe(400);
    expect(((await (await j(`/api/p/leads/leads/${l.id}`, "PATCH", { score: 82 })).json()) as { stage: string }).stage).toBe("scored");
    const d = await (await j(`/api/p/leads/leads/${l.id}/draft`, "POST")).json() as { stage: string; offer: string };
    expect(d.stage).toBe("offer"); expect(d.offer).toContain("Baker");
    expect(((await (await j(`/api/p/leads/leads/${l.id}/approve`, "POST")).json()) as { stage: string }).stage).toBe("approved");
    expect((await j(`/api/p/leads/leads/${l.id}/send`, "POST")).status).toBe(404);
  });
  test("the module source has no way to send", async () => {
    const src = await Bun.file(new URL("../plugins/leads/server.ts", import.meta.url)).text();
    expect(/\bfetch\(|nodemailer|smtp|sendmail|Bun\.spawn/i.test(src.replace(/\/\/.*$/gm, ""))).toBe(false);
  });
});
