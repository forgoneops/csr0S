// R54: contributions are data, not shell code. A module's manifest declares a settings row, a live-bar item
// and a command; the core reports them for a running module only, under the module's permissions and the
// edition gate. Switch the module off and its routes, timer and listener go with it.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Hono } from "hono";

const DATA = `/tmp/caesaros-contrib-${process.pid}`;
const prior = { data: process.env.CAESAROS_DATA, dirs: process.env.CAESAROS_MODULE_DIRS, edition: process.env.CAESAROS_EDITION };

type Ctx = { app: Hono; plugins: Awaited<ReturnType<typeof import("../core/plugins").loadPlugins>> };
let on: Ctx;
let off: Ctx;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  process.env.CAESAROS_DATA = DATA;
  process.env.CAESAROS_MODULE_DIRS = "plugins,tests/fixtures/plugins";
  delete process.env.CAESAROS_EDITION;                       // the owner build is the default
  const { loadPlugins } = await import("../core/plugins");
  const appOn = new Hono();
  on = { app: appOn, plugins: await loadPlugins(appOn, [], ["contrib-demo"]) };
  const appOff = new Hono();
  off = { app: appOff, plugins: await loadPlugins(appOff, [], []) };   // defaultOff and not named: never started
});

afterAll(() => {
  process.env.CAESAROS_DATA = prior.data;
  process.env.CAESAROS_MODULE_DIRS = prior.dirs;
  if (prior.edition === undefined) delete process.env.CAESAROS_EDITION; else process.env.CAESAROS_EDITION = prior.edition;
});

describe("contribution registry", () => {
  test("a defaultOff module is found, off, and registers nothing", () => {
    const info = off.plugins.all().find((m) => m.id === "contrib-demo");
    expect(info).toBeTruthy();
    expect(info?.defaultOff).toBe(true);
    expect(info?.available).toBe(true);
    expect(info?.enabled).toBe(false);
    expect(info?.running).toBe(false);
    expect(info?.contributions).toEqual({ settings: [], status: [], commands: [], actions: [] });
  });

  test("a broken manifest is skipped, not fatal to the core", () => {
    expect(on.plugins.all().some((m) => m.id === "broken-json")).toBe(false);
    expect(on.plugins.all().some((m) => m.id === "contrib-demo")).toBe(true);
  });

  test("a running module registers one item on every surface, from the manifest alone", () => {
    const info = on.plugins.all().find((m) => m.id === "contrib-demo");
    expect(info?.running).toBe(true);
    expect(info?.contributions.settings.map((s) => s.id)).toEqual(["counter"]);
    expect(info?.contributions.status.map((s) => s.id)).toEqual(["pings"]);
    expect(info?.contributions.commands.map((c) => c.id)).toEqual(["bump"]);
    expect(info?.contributions.actions.map((a) => a.id)).toEqual(["bump"]);
  });

  test("a contribution naming a permission the manifest lacks is dropped, not shown", () => {
    const info = on.plugins.all().find((m) => m.id === "contrib-demo");
    // Both the "vault" status item and the "vault" action exist in the manifest; neither is visible.
    expect(info?.contributions.status.some((s) => s.id === "hidden")).toBe(false);
    expect(info?.contributions.actions.some((a) => a.id === "secret")).toBe(false);
  });

  test("the read tier answers, and the declared action runs", async () => {
    const status = await on.app.request("/api/p/contrib-demo/status");
    expect(status.status).toBe(200);
    expect(await status.json()).toEqual({ value: "0", tone: "ok" });

    const bump = await on.app.request("/api/p/contrib-demo/bump", { method: "POST" });
    expect(bump.status).toBe(200);
    expect(await bump.json()).toEqual({ pings: 1 });
  });

  test("switching it off removes the surface items, the routes, the timer and the listener", async () => {
    const { publish } = await import("../core/events");
    const { kv } = await import("../core/db");
    const store = kv("module.contrib-demo");
    // The timer and the listener are alive while the module is on.
    publish("probe", {});
    await sleep(1_200);
    const before = await (await on.app.request("/api/p/contrib-demo/ticks")).json() as { ticks: number; heard: number };
    expect(before.ticks).toBeGreaterThan(0);
    expect(before.heard).toBeGreaterThan(0);

    expect(on.plugins.setEnabled("contrib-demo", false)).toBe("now");
    const info = on.plugins.all().find((m) => m.id === "contrib-demo");
    expect(info?.running).toBe(false);
    expect(info?.contributions).toEqual({ settings: [], status: [], commands: [], actions: [] });
    expect((await on.app.request("/api/p/contrib-demo/status")).status).toBe(404);

    // Nothing behind the row keeps running: the store is read directly, because the routes are gone.
    const frozen = store.get<number>("ticks", 0);
    await sleep(1_600);
    publish("probe", {});
    expect(store.get<number>("ticks", 0)).toBe(frozen);
    expect(store.get<number>("heard", 0)).toBe(before.heard);

    // Switching it on brings the surfaces and its background work back without a rebuild.
    expect(on.plugins.setEnabled("contrib-demo", true)).toBe("now");
    const back = on.plugins.all().find((m) => m.id === "contrib-demo");
    expect(back?.contributions.status).toHaveLength(1);
    await sleep(1_100);
    expect(store.get<number>("ticks", 0)).toBeGreaterThan(frozen);
  });

  test("an owner-only module registers nothing in a consumer build", async () => {
    process.env.CAESAROS_EDITION = "standard";
    const { loadPlugins } = await import("../core/plugins");
    const app = new Hono();
    const plugins = await loadPlugins(app, [], ["owner-only"]);
    const info = plugins.all().find((m) => m.id === "owner-only");
    expect(info?.running).toBe(false);
    expect(info?.enabled).toBe(false);
    expect(info?.available).toBe(false);
    expect(plugins.setEnabled("owner-only", true)).toBe("unavailable");
    expect(info?.contributions).toEqual({ settings: [], status: [], commands: [], actions: [] });
    expect((await app.request("/api/p/owner-only/status")).status).toBe(404);
    process.env.CAESAROS_EDITION = "";
  });
});

describe("manifest contract", () => {
  const base = { id: "demo", name: "Demo", version: "0.1.0", description: "x", edition: "standard" as const };

  test("a contribution that points at an undeclared action is rejected", async () => {
    const { PluginManifest } = await import("../core/schema");
    const bad = { ...base, contributions: { commands: [{ id: "run", label: "Run", action: "nope" }] } };
    expect(PluginManifest.safeParse(bad).success).toBe(false);
  });

  test("a path outside the module namespace is rejected", async () => {
    const { PluginManifest } = await import("../core/schema");
    expect(PluginManifest.safeParse({ ...base, contributions: { status: [{ id: "s", label: "S", read: "/../../settings" }] } }).success).toBe(false);
    expect(PluginManifest.safeParse({ ...base, contributions: { status: [{ id: "s", label: "S", read: "https://elsewhere.test/x" }] } }).success).toBe(false);
  });

  test("a command needs an action or a path", async () => {
    const { PluginManifest } = await import("../core/schema");
    expect(PluginManifest.safeParse({ ...base, contributions: { commands: [{ id: "c", label: "C" }] } }).success).toBe(false);
  });

  test("duplicate ids inside one surface are rejected", async () => {
    const { PluginManifest } = await import("../core/schema");
    const two = { ...base, contributions: { status: [{ id: "s", label: "A", read: "/a" }, { id: "s", label: "B", read: "/b" }] } };
    expect(PluginManifest.safeParse(two).success).toBe(false);
  });

  test("a manifest with no contributions gets an empty set", async () => {
    const { PluginManifest } = await import("../core/schema");
    const parsed = PluginManifest.safeParse({ id: "plain", name: "Plain", version: "1", description: "x" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.contributions).toEqual({ settings: [], status: [], commands: [], actions: [] });
  });
});