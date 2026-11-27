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

  test("the worker matches shell files across the ?v= stamp and the page has a core-unreachable banner", () => {
    expect(sw).toContain("ignoreSearch: true");
    expect(readFileSync(join(ATRIUM, "index.html"), "utf8")).toContain('class="nx-offline"');
    expect(readFileSync(join(ATRIUM, "kit.css"), "utf8")).toContain("html[data-core-down] .nx-offline");
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

  test("only a good copy of the app is saved as the shell, and a 401 navigation drops everything saved", async () => {
    const store = new Map<string, Map<string, unknown>>([["caesaros-atrium-x", new Map([["/", "shell"]])], ["other-app", new Map()]]);
    const caches = {
      keys: async () => [...store.keys()], delete: async (k: string) => store.delete(k),
      open: async (k: string) => { const m = store.get(k) ?? store.set(k, new Map()).get(k)!; return { put: async (key: unknown, v: unknown) => { m.set(String(key), v); } }; },
      match: async () => "saved shell",
    };
    let onFetch!: (e: unknown) => void, answer!: () => Promise<Response>;
    const self = { addEventListener: (n: string, f: (e: unknown) => void) => { if (n === "fetch") onFetch = f; }, location: { origin: "http://app.test" } };
    new Function("self", "caches", "fetch", sw)(self, caches, () => answer());
    const go = async (path: string, status: number, mode = "navigate") => {
      answer = async () => new Response("x", { status });
      let out: Promise<unknown> | undefined;
      onFetch({ request: { method: "GET", url: "http://app.test" + path, mode }, respondWith: (p: Promise<unknown>) => { out = p; } });
      await out; await Bun.sleep(0);
      return !!out;
    };
    await go("/", 503); await go("/chat", 200);
    expect(store.get("caesaros-atrium-x")!.get("/")).toBe("shell");
    expect(await go("/v1/models", 200, "cors")).toBe(false);
    await go("/", 401);
    expect([...store.keys()]).toEqual(["other-app"]);
    answer = () => Promise.reject(new Error("offline"));
    let offline: Promise<unknown> | undefined;
    onFetch({ request: { method: "GET", url: "http://app.test/", mode: "navigate" }, respondWith: (p: Promise<unknown>) => { offline = p; } });
    expect(await offline).toBe("saved shell");
  });

  test("a revoked device reloads into the gate once; other 401s are left alone", async () => {
    let body = { error: "login_required" }, reloads = 0;
    const window = { fetch: async () => Response.json(body, { status: 401 }) } as { fetch: () => Promise<Response> };
    const quiet = { addEventListener: () => {}, getElementById: () => null };
    new Function("window", "document", "location", "setInterval", readFileSync(join(ATRIUM, "gateway.js"), "utf8"))(window, quiet, { reload: () => { reloads++; } }, () => 0);
    await window.fetch(); expect(reloads).toBe(0);
    body = { error: "gateway_token_required" };
    expect(await (await window.fetch()).json()).toEqual(body);   // the caller can still read the answer
    await window.fetch(); expect(reloads).toBe(1);
  });

  test("plain-http gateway: nothing in the shell needs randomUUID, and the Vault says why it cannot work", () => {
    expect(readFileSync(join(ATRIUM, "media.js"), "utf8")).not.toContain("randomUUID");
    expect(readFileSync(join(ATRIUM, "real.js"), "utf8")).toContain("&& !crypto.subtle) { VT.err");
  });

  test("a percent-encoded /api path meets the same cross-site and host guards as the plain one", async () => {
    const env = { server: { requestIP: () => ({ address: "127.0.0.1" }) } };
    const hit = async (path: string, init: RequestInit) => (await (app as unknown as { fetch: (r: Request, e: object) => Promise<Response> }).fetch(new Request("http://127.0.0.1:4410" + path, init), env)).status;
    for (const path of ["/api/tokens", "/%61pi/tokens", "/a%70i/tokens"]) {
      expect(await hit(path, { method: "POST", headers: { origin: "http://evil.example", "sec-fetch-site": "cross-site", "content-type": "text/plain" }, body: '{"name":"intruder"}' })).toBe(403);
      expect(await hit(path, { headers: { host: "evil.example.com" } })).toBe(421);
    }
  });

  test("the saved offline shell starts with an empty feed, not invented items", () => {
    expect(readFileSync(join(ATRIUM, "index.html"), "utf8")).toContain("const FEED=[];");
  });

  test("no live data or worker path is ever cached", () => {
    expect(shell.some((p) => p.startsWith("/api/"))).toBe(false);
    expect(shell).not.toContain("/sw.js");
    expect(sw).toContain('startsWith("/api/")');
    expect(sw).toContain('url.pathname === "/sw.js"');
  });
});
