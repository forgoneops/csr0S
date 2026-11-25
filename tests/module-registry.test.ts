// The module pipeline end to end: a real module in plugins/ is discovered, mounted at /api/p/<id>/,
// keeps its own store, and answers 404 the moment it is switched off. No shell rebuild involved.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Hono } from "hono";

const DIR = `/tmp/caesaros-module-${process.pid}`;
process.env.CAESAROS_DATA = DIR;
process.env.CAESAROS_MODULE_DIRS = "plugins";
process.env.CAESAROS_EDITION = "standard";

type Mounted = { app: Hono; plugins: Awaited<ReturnType<typeof import("../core/plugins").loadPlugins>> };
let ctx: Mounted;

beforeAll(async () => {
  const { loadPlugins } = await import("../core/plugins");
  const app = new Hono();
  const plugins = await loadPlugins(app, []);
  ctx = { app, plugins };
});

afterAll(() => { /* the temp data folder is small and lives outside the repo */ });

describe("module registry", () => {
  test("the module is discovered and lists itself with its manifest", () => {
    const hello = ctx.plugins.all().find((m) => m.id === "hello");
    expect(hello).toBeTruthy();
    expect(hello?.version).toBe("0.1.0");
    expect(hello?.running).toBe(true);
  });

  test("its routes are mounted under /api/p/hello and its store persists", async () => {
    const r1 = await ctx.app.request("/api/p/hello");
    expect(r1.status).toBe(200);
    expect((await r1.json() as { module: string }).module).toBe("hello");

    const ping = await ctx.app.request("/api/p/hello/ping", { method: "POST" });
    expect((await ping.json() as { pings: number }).pings).toBe(1);
    const again = await ctx.app.request("/api/p/hello/ping", { method: "POST" });
    expect((await again.json() as { pings: number }).pings).toBe(2);
  });

  test("switching it off stops its routes at once, and on brings them back", async () => {
    expect(ctx.plugins.setEnabled("hello", false)).toBe("now");
    const off = await ctx.app.request("/api/p/hello");
    expect(off.status).toBe(404);

    expect(ctx.plugins.setEnabled("hello", true)).toBe("now");
    const on = await ctx.app.request("/api/p/hello");
    expect(on.status).toBe(200);
  });

  test("a consumer build never starts an owner-only module", async () => {
    const { leftOutOfEdition } = await import("../core/plugins");
    expect(leftOutOfEdition("owner", "standard")).toBe(true);
    expect(leftOutOfEdition("standard", "standard")).toBe(false);
    expect(leftOutOfEdition("owner", "owner")).toBe(false);
    expect(leftOutOfEdition("owner", "")).toBe(false);
  });

  test("an unknown id is reported, not invented", () => {
    expect(ctx.plugins.setEnabled("nope", true)).toBe("unknown");
  });
});
