// The Atrium's PWA layer: a manifest with icons on disk, a worker served no-cache with the build id
// filled in, a precache list of files that really exist, and no live data path in that list.
import { beforeAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ATRIUM = join(import.meta.dir, "..", "web", "atrium");
const manifest = JSON.parse(readFileSync(join(ATRIUM, "manifest.webmanifest"), "utf8"));
const sw = readFileSync(join(ATRIUM, "sw.js"), "utf8");
const shell = [...(sw.match(/const SHELL = \[([\s\S]*?)\];/)?.[1] ?? "").matchAll(/"(\/[^"]*)"/g)].map((m) => m[1]);

type App = { request: (path: string, init?: RequestInit) => Promise<Response> };
let app: App;

beforeAll(async () => {
  ({ app } = await import("../core/server") as unknown as { app: App });
});

describe("Atrium PWA", () => {
  test("manifest is installable: CaesarOS/Caesar, standalone at /, dark colours, icons", () => {
    expect(manifest.name).toBe("CaesarOS");
    expect(manifest.short_name).toBe("Caesar");
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("/");
    expect(manifest.scope).toBe("/");
    expect(manifest.theme_color).toBe("#0a0b12");
    expect(manifest.background_color).toBe("#0a0b12");
    expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toContain("192x192");
    expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toContain("512x512");
    expect(manifest.icons.some((i: { purpose: string }) => i.purpose === "maskable")).toBe(true);
  });

  test("every icon the manifest names exists on disk", () => {
    for (const i of manifest.icons) expect(existsSync(join(ATRIUM, i.src))).toBe(true);
  });

  test("the service worker route returns JavaScript, no-cache, with the build id filled in", async () => {
    const r = await app.request("/sw.js");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("javascript");
    expect(r.headers.get("cache-control")).toContain("no-cache");
    const body = await r.text();
    expect(body).toContain("caesaros-atrium-");
    expect(body).not.toContain("__BUILD__");
  });

  test("every precached path exists on disk", () => {
    expect(shell.length).toBeGreaterThan(10);
    for (const p of shell) expect(existsSync(join(ATRIUM, p === "/" ? "index.html" : p))).toBe(true);
  });

  test("no live data or worker path is ever cached", () => {
    expect(shell.some((p) => p.startsWith("/api/"))).toBe(false);
    expect(shell).not.toContain("/sw.js");
    expect(sw).toContain('startsWith("/api/")');
    expect(sw).toContain('url.pathname === "/sw.js"');
  });
});
