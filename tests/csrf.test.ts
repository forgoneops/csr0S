// A page on another site must not be able to write to this server through the person's browser.
import { describe, expect, test } from "bun:test";
import { crossSiteWrite } from "../core/csrf";

const own = { host: "127.0.0.1:4410" };

describe("the decision", () => {
  test("reads are never refused", () => {
    for (const m of ["GET", "HEAD", "OPTIONS", "get"]) expect(crossSiteWrite(m, { ...own, origin: "https://evil.example", secFetchSite: "cross-site" })).toBeNull();
  });
  test("a write from this server's own origin passes, in any case and on any host form", () => {
    expect(crossSiteWrite("POST", { ...own, origin: "http://127.0.0.1:4410", secFetchSite: "same-origin" })).toBeNull();
    expect(crossSiteWrite("PUT", { host: "Localhost:4410", origin: "http://localhost:4410" })).toBeNull();
    expect(crossSiteWrite("DELETE", { host: "box.tail1234.ts.net", origin: "https://box.tail1234.ts.net".replace("https", "http") })).toBeNull();
  });
  test("a write with no Origin and no fetch metadata is a local tool, not a web page, and passes", () => {
    expect(crossSiteWrite("POST", own)).toBeNull();
    expect(crossSiteWrite("POST", { ...own, origin: "" })).toBeNull();
  });
  test("every cross-origin shape is refused: other site, other port, null, junk, cross-site metadata", () => {
    for (const origin of ["https://evil.example", "http://127.0.0.1:3000", "http://localhost:4410", "null", "NULL", "not a url", "http://127.0.0.1:4410.evil.example"])
      expect(crossSiteWrite("POST", { ...own, origin })).not.toBeNull();
    expect(crossSiteWrite("POST", { ...own, origin: "http://127.0.0.1:4410", secFetchSite: "cross-site" })).toBe("cross-site request");
    expect(crossSiteWrite("PATCH", { ...own, secFetchSite: "Cross-Site" })).toBe("cross-site request");
  });
  test("a proxy origin is allowed only when the person lists it", () => {
    const h = { host: "internal:4410", origin: "https://caesar.example" };
    expect(crossSiteWrite("POST", h)).not.toBeNull();
    process.env.CAESAROS_ORIGINS = "https://other.example, https://caesar.example";
    try { expect(crossSiteWrite("POST", h)).toBeNull(); } finally { delete process.env.CAESAROS_ORIGINS; }
  });
});

describe("on the real core", () => {
  type App = { request: (path: string, init?: RequestInit) => Promise<Response> };
  test("the write routes refuse a cross-site simple request and change nothing; the same origin works", async () => {
    const { mkdtempSync } = await import("node:fs"), { tmpdir } = await import("node:os"), { join } = await import("node:path");
    process.env.CAESAROS_DATA ??= mkdtempSync(join(tmpdir(), "caesaros-csrf-")); process.env.CAESAROS_MODULE_DIRS = "plugins";
    const { app } = await import("../core/server") as unknown as { app: App };
    const evil = { "content-type": "text/plain", Origin: "https://evil.example", "Sec-Fetch-Site": "cross-site", "Sec-Fetch-Mode": "no-cors", Host: "127.0.0.1:4410" };
    const attempts: [string, string, string][] = [
      ["PUT", "/api/settings", '{"theme":"lumen"}'], ["POST", "/api/model-servers", '{"name":"evil","url":"http://attacker.example"}'],
      ["POST", "/api/gateways", '{"name":"evil","url":"http://attacker.example"}'], ["POST", "/api/chat/sessions", '{"engine":"ollama"}'],
      ["POST", "/api/tokens", '{"name":"evil"}'], ["POST", "/api/notes", '{"name":"evil"}'],
    ];
    const before = await (await app.request("/api/settings")).text();
    for (const [m, p, body] of attempts) {
      const r = await app.request(p, { method: m, headers: evil, body });
      expect([m, p, r.status]).toEqual([m, p, 403]);
      expect(((await r.json()) as { error: string }).error).toBe("cross_site_write_refused");
    }
    expect(await (await app.request("/api/settings")).text()).toBe(before);
    expect(((await (await app.request("/api/model-servers")).json()) as unknown[]).some((s) => (s as { name: string }).name === "evil")).toBe(false);

    const own = { "content-type": "application/json", Origin: "http://127.0.0.1:4410", "Sec-Fetch-Site": "same-origin", Host: "127.0.0.1:4410" };
    expect((await app.request("/api/settings", { method: "PUT", headers: own, body: '{"textScale":1}' })).status).toBe(200);
  });
});
