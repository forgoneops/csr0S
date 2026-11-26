// Serve as web app: the token gate (loopback free, everything else needs the token), rate limit, rotate and stop,
// the control routes (this machine only), a second "device" on a different origin over real sockets, and the
// connections registry rules (unique labels, plain-http hosts, secrets 0600 and never echoed).
import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { createWebGate } from "../core/webgate";
import { addGateway, gatewayRoutes, secretStore, type Gateway } from "../core/gateways";
import { Settings } from "../core/schema";

const store = () => { const m = new Map<string, unknown>(); return { get: <T>(k: string, d: T) => (m.has(k) ? (m.get(k) as T) : d), set: (k: string, v: unknown) => { m.set(k, v); } }; };
const free = () => { const s = Bun.serve({ port: 0, fetch: () => new Response("") }); const p = s.port!; s.stop(true); return p; };

// An app with one private route and a page, behind the gate, served on 127.0.0.1 (this device) and, through the
// gate's own listener, on 127.0.0.2 (another device: a different origin, flagged as a gateway request).
const app = new Hono();
const port = free();
const gate = createWebGate({ store: store(), port, fetch: (req, env) => app.fetch(req, env), addrs: () => ({ lan: "127.0.0.2", tailnet: null }) });
app.use("*", gate.gate());
app.get("/", (c) => c.html("<h1>app</h1>"));
app.get("/api/secret", (c) => c.json({ secret: 42 }));
app.get("/api/health", (c) => c.json({ ok: true, name: "CaesarOS" }));
gate.routes(app, () => true);
const here = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: (req, server) => app.fetch(req, { server }) });
afterAll(() => { here.stop(true); gate.stop(); });
const home = `http://127.0.0.1:${here.port}`;
const other = `http://127.0.0.2:${port}`;
const put = (body: unknown) => fetch(`${home}/api/webgate`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("token gate", () => {
  test("this device needs no token, and nothing listens beyond it by default", async () => {
    expect((await fetch(`${home}/api/secret`)).status).toBe(200);
    expect(gate.status()).toMatchObject({ reach: "device", listening: false, hasToken: false });
    await expect(fetch(`${other}/api/secret`)).rejects.toThrow();
  });

  test("turning it on starts the listener; another device without a token is refused, with no CORS header", async () => {
    const r = await (await put({ reach: "lan" })).json() as { token: string; link: string; listening: boolean };
    expect(r.listening).toBe(true);
    expect(r.token).toStartWith("cgw_");
    expect(r.link).toBe(`${other}/?gt=${r.token}`);
    const api = await fetch(`${other}/api/secret`, { headers: { origin: "http://evil.example" } });
    expect(api.status).toBe(401);
    expect(api.headers.get("access-control-allow-origin")).toBeNull();
    const page = await fetch(`${other}/`);
    expect(page.status).toBe(401);
    expect(await page.text()).not.toContain("<h1>app</h1>");
    // health and the files a browser fetches without credentials stay open; they hold nothing private
    expect((await fetch(`${other}/api/health`)).status).toBe(200);
    // the status never carries the token
    expect(JSON.stringify(await (await fetch(`${home}/api/webgate`)).json())).not.toContain(r.token);
  });

  test("the link opens the app once: cookie set, token stripped from the URL, then the cookie is enough; Bearer works too", async () => {
    const t = (await (await put({ reach: "lan" })).json() as { token: string }).token;
    const first = await fetch(`${other}/?gt=${t}`, { redirect: "manual", headers: { "user-agent": "Mozilla/5.0 (Android 14) Chrome/120" } });
    expect(first.status).toBe(302);
    expect(first.headers.get("location")).toBe("/");
    const cookie = first.headers.get("set-cookie")!;
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    const ck = cookie.split(";")[0]!;
    expect(await (await fetch(`${other}/`, { headers: { cookie: ck } })).text()).toContain("<h1>app</h1>");
    expect(await (await fetch(`${other}/api/secret`, { headers: { cookie: ck } })).json()).toEqual({ secret: 42 });
    expect((await fetch(`${other}/api/secret`, { headers: { authorization: `Bearer ${t}` } })).status).toBe(200);
    const st = gate.status();
    expect(st.devices.length).toBeGreaterThan(0);
    expect(st.devices.map((d) => d.name)).toContain("Android Chrome");
  });

  test("another device cannot reconfigure the gateway, even with a valid token", async () => {
    const t = (await (await put({ reach: "lan" })).json() as { token: string }).token;
    for (const [m, p] of [["GET", "/api/webgate"], ["PUT", "/api/webgate"], ["POST", "/api/webgate/rotate"], ["DELETE", "/api/webgate"]] as const) {
      const r = await fetch(`${other}${p}`, { method: m, headers: { authorization: `Bearer ${t}`, "content-type": "application/json" }, body: m === "PUT" ? JSON.stringify({ reach: "device" }) : undefined });
      expect(r.status).toBe(403);
    }
    expect(gate.status().reach).toBe("lan");
  });

  test("rotate invalidates the old token; a bad reach is refused; Stop closes the listener and revokes", async () => {
    const old = (await (await put({ reach: "lan" })).json() as { token: string }).token;
    const fresh = (await (await fetch(`${home}/api/webgate/rotate`, { method: "POST" })).json() as { token: string }).token;
    expect(fresh).not.toBe(old);
    expect((await fetch(`${other}/api/secret`, { headers: { authorization: `Bearer ${old}` } })).status).toBe(401);
    expect((await fetch(`${other}/api/secret`, { headers: { authorization: `Bearer ${fresh}` } })).status).toBe(200);
    expect((await put({ reach: "everyone" })).status).toBe(400);
    expect((await fetch(`${home}/api/webgate`, { method: "DELETE" })).status).toBe(200);
    expect(gate.status()).toMatchObject({ reach: "device", listening: false, hasToken: false });
    await expect(fetch(`${other}/api/secret`, { headers: { authorization: `Bearer ${fresh}` } })).rejects.toThrow();
    expect(gate.valid(fresh)).toBe(false);
  });

  test("an address that does not exist leaves the reach on this device only", async () => {
    const g = createWebGate({ store: store(), port: free(), fetch: () => new Response(""), addrs: () => ({ lan: null, tailnet: null }) });
    g.setReach("tailnet");
    expect(g.status()).toMatchObject({ reach: "device", listening: false, error: "no_address" });
  });

  test("wrong tokens are refused and, after a few, rate limited; the right one is limited too until the wait ends (last: it shares the peer)", async () => {
    const t = (await (await put({ reach: "lan" })).json() as { token: string }).token;
    const codes: number[] = [];
    for (let i = 0; i < 7; i++) codes.push((await fetch(`${other}/api/secret`, { headers: { authorization: "Bearer cgw_wrong" + i } })).status);
    expect(codes.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(codes[6]).toBe(429);
    expect((await fetch(`${other}/api/secret`, { headers: { authorization: `Bearer ${t}` } })).status).toBe(429);
  });
});

describe("connections registry", () => {
  const dir = mkdtempSync(join(tmpdir(), "caesaros-conn-"));
  const secrets = secretStore(join(dir, "gateway-secrets.json"));
  let saved: Settings = Settings.parse({});
  const reg = new Hono();
  gatewayRoutes(reg, { read: () => saved, save: (n) => { saved = n; }, version: "t", secrets });
  const post = (b: unknown) => reg.request("/api/gateways", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });

  test("labels are unique ignoring case; This device is reserved; plain http only for private or tailnet hosts", () => {
    const a = addGateway([], { name: "Studio", url: "https://a.example" }) as { list: Gateway[] };
    expect(addGateway(a.list, { name: "studio", url: "https://b.example" })).toEqual({ error: "name_duplicate" });
    expect(addGateway([], { name: "This Device", url: "https://a.example" })).toEqual({ error: "name_reserved" });
    expect(addGateway([], { name: "x", url: "http://203.0.113.5:4410" })).toEqual({ error: "url_plain_http" });
    expect("list" in addGateway([], { name: "x", url: "http://172.16.5.20:4410" })).toBe(true);
    expect("list" in addGateway([], { name: "x", url: "http://my-box.local:4410" })).toBe(true);
    expect(addGateway([], { name: "x", url: "https://a.example", token: "short" })).toEqual({ error: "token_invalid" });
  });

  test("the token is stored 0600, never echoed, replaced on request and removed with the connection", async () => {
    const r = await post({ name: "Phone", url: "http://172.16.5.20:4410", token: "cgw_secret-token-value" });
    expect(r.status).toBe(201);
    const made = await r.json() as { id: string; hasToken: boolean };
    expect(made.hasToken).toBe(true);
    expect(JSON.stringify(made)).not.toContain("secret-token-value");
    expect(JSON.stringify(await (await reg.request("/api/gateways")).json())).not.toContain("secret-token-value");
    expect(statSync(join(dir, "gateway-secrets.json")).mode & 0o777).toBe(0o600);
    expect((await reg.request(`/api/gateways/${made.id}/token`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: "cgw_other-token-value" }) })).status).toBe(200);
    // Open sends the browser to the address with the token, as a redirect and nowhere else
    const open = await reg.request(`/api/gateways/${made.id}/open`);
    expect(open.status).toBe(302);
    expect(open.headers.get("location")).toBe("http://172.16.5.20:4410/?gt=cgw_other-token-value");
    expect((await reg.request(`/api/gateways/${made.id}`, { method: "DELETE" })).status).toBe(200);
    expect(secrets.has(made.id)).toBe(false);
    expect((await post({ name: "Dup", url: "https://a.example" })).status).toBe(201);
    expect((await post({ name: "dup", url: "https://b.example" })).status).toBe(400);
  });
});

describe("QR encoder", () => {
  test("makes an svg for a link with its key and refuses text longer than version 6 holds", async () => {
    (globalThis as unknown as { window: object }).window = {};
    await import(/* @vite-ignore */ "../web/atrium/" + "qr.js");
    const qr = (globalThis as unknown as { window: { CaesarQR: { svg: (t: string) => string } } }).window.CaesarQR;
    expect(qr.svg("http://172.16.5.10:4410/?gt=cgw_AbCdEfGhIjKlMnOpQrStUv")).toStartWith("<svg");
    expect(qr.svg("x".repeat(135))).toBe("");
  });
});
