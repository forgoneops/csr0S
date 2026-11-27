// Serve as web app: the token gate (loopback free, everything else needs the token), rate limit, rotate and stop,
// the control routes (this machine only), a second "device" on a different origin over real sockets, and the
// connections registry rules (unique labels, plain-http hosts, secrets 0600 and never echoed).
import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { createWebGate } from "../core/webgate";
import { addGateway, gatewayRoutes, registryProblem, secretStore, type Gateway } from "../core/gateways";
import { access } from "../core/principal";
import { clientAddress } from "../core/auth";
import { stream } from "../core/events";
import { TerminalSessions, terminalSocket, useTerminal } from "../core/terminal";
import { readFileSync } from "node:fs";
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
app.get("/api/events", () => stream());
app.all("/api/who", (c) => c.json({ kind: access.principal(c).kind }));
const shells = new TerminalSessions({ create: () => ({ write() {}, resize() {}, close() {} }), audit: () => {}, dir: mkdtempSync(join(tmpdir(), "caesaros-term-")) });
const unhook = useTerminal(app, shells);
const here = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: (req, server) => app.fetch(req, { server }) });
afterAll(() => { unhook(); here.stop(true); gate.stop(); });
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

  test("a request a proxy on this machine forwards needs the key like any other device", async () => {
    const t = (await (await put({ reach: "lan" })).json() as { token: string }).token;
    for (const h of [{ "x-forwarded-for": "198.51.100.1" }, { "x-forwarded-host": "box.example" }, { forwarded: "for=198.51.100.1" }, { "tailscale-user-login": "someone" }] as Record<string, string>[]) {
      expect((await fetch(`${home}/api/secret`, { headers: h })).status).toBe(401);
      expect((await fetch(`${home}/api/webgate`, { headers: { ...h, authorization: `Bearer ${t}` } })).status).toBe(403);   // control stays on this machine
    }
    const https = await fetch(`${home}/?gt=${t}`, { redirect: "manual", headers: { "x-forwarded-for": "198.51.100.2", "x-forwarded-proto": "https" } });
    expect(https.headers.get("set-cookie")).toContain("; Secure");
    const plain = await fetch(`${other}/?gt=${t}`, { redirect: "manual" });
    expect(plain.headers.get("set-cookie")).toContain("Max-Age=2592000");
    expect(plain.headers.get("set-cookie")).not.toContain("Secure");
    expect((await fetch(`${other}/api/secret`, { headers: { authorization: `Bearer ${t}` } })).headers.get("cache-control")).toBe("no-store");
  });

  test("on plain http the checked cookie makes the person's browser the operator; a write also has to name this origin", async () => {
    const t = (await (await put({ reach: "lan" })).json() as { token: string }).token;
    const cookie = `cg=${t}`;   // no Sec-Fetch headers: what a browser sends to a plain-http LAN or tailnet address
    const who = async (method: string, headers: Record<string, string>) => ((await (await fetch(`${other}/api/who`, { method, headers })).json()) as { kind?: string }).kind;
    expect(await who("GET", { cookie })).toBe("operator");
    expect(await who("POST", { cookie, origin: other })).toBe("operator");
    expect(await who("POST", { cookie })).toBe("anonymous");
    expect(await who("POST", { cookie, origin: "http://127.0.0.2:1" })).toBe("anonymous");
    expect(await who("POST", { cookie, origin: "null" })).toBe("anonymous");
    expect(await who("POST", { cookie, origin: other, "sec-fetch-site": "cross-site" })).toBe("anonymous");
    expect(await who("GET", { authorization: `Bearer ${t}` })).toBe("anonymous");   // a tool with the key is not a browser
    expect(await who("GET", {})).toBeUndefined();
  });

  test("rotate and Stop end an open event stream, on the gateway listener and through a proxy", async () => {
    const open = async (base: string, headers: Record<string, string>) => {
      const r = await fetch(`${base}/api/events`, { headers });
      const reader = r.body!.getReader(); await reader.read();   // hello
      return { ended: (async () => { for (;;) if ((await reader.read()).done) return "closed"; })().catch(() => "closed") };   // wrapped, so await open() does not await the end
    };
    const within = (o: { ended: Promise<string> }) => Promise.race([o.ended, Bun.sleep(2000).then(() => "still open")]);
    for (const end of ["rotate", "stop"] as const) {
      const t = (await (await put({ reach: "lan" })).json() as { token: string }).token;
      const direct = await open(other, { authorization: `Bearer ${t}` });
      const proxied = await open(home, { authorization: `Bearer ${t}`, "x-forwarded-for": "198.51.100.3" });
      await fetch(`${home}/api/webgate${end === "rotate" ? "/rotate" : ""}`, { method: end === "rotate" ? "POST" : "DELETE" });
      expect([end, await within(direct), await within(proxied)]).toEqual([end, "closed", "closed"]);
    }
  });

  test("the same dead cookie, however often, does not lock the device out of its new link", async () => {
    const t = (await (await put({ reach: "lan" })).json() as { token: string }).token;
    const from = { "x-forwarded-for": "198.51.100.4" };
    for (let i = 0; i < 12; i++) expect((await fetch(`${home}/api/secret`, { headers: { ...from, cookie: "cg=cgw_revoked" } })).status).toBe(401);
    expect((await fetch(`${home}/api/secret`, { headers: { ...from, authorization: `Bearer ${t}` } })).status).toBe(200);
  });

  test("the rate limit reads the socket address; X-Forwarded-For counts only from a proxy on this machine, last entry", () => {
    const ctx = (peer: string, xff?: string) => ({ env: { server: { requestIP: () => ({ address: peer }) } }, req: { raw: new Request("http://x"), header: () => xff } }) as never;
    expect(clientAddress(ctx("203.0.113.9", "198.51.100.5"))).toBe("203.0.113.9");
    expect(clientAddress(ctx("127.0.0.1", "made-up, 198.51.100.5"))).toBe("198.51.100.5");
    expect(clientAddress(ctx("127.0.0.1"))).toBe("127.0.0.1");
  });

  test("only real icon files are open without a key; an encoded path cannot ride on them", async () => {
    await put({ reach: "lan" });
    for (const p of ["/icons/..%2f..%2fapi%2fsecret", "/icons/a/b.png", "/%61pi/secret"]) expect((await fetch(`${other}${p}`)).status).toBe(401);
  });

  test("the terminal is not served over the gateway link, and revoke cuts a remote viewer that came through a proxy", async () => {
    const t = (await (await put({ reach: "lan" })).json() as { token: string }).token;
    const r = await fetch(`${other}/api/terminal/sessions`, { method: "POST", headers: { cookie: `cg=${t}`, origin: other, "content-type": "application/json" }, body: "{}" });
    expect(r.status).toBe(403);
    expect(((await r.json()) as { error: string }).error).toContain("not over this gateway link");
    expect(shells.size()).toBe(0);
    const closed: string[] = [];
    for (const remote of [true, false]) {
      const { id } = shells.create();
      terminalSocket(shells).open({ data: { id, remote }, send() {}, close: (code) => { closed.push(`${remote}:${code}`); } });
    }
    await fetch(`${home}/api/webgate/rotate`, { method: "POST" });
    expect(closed).toEqual(["true:4003"]);
    expect(shells.size()).toBe(2);   // the shells stay with this computer
    shells.shutdown();
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

  test("a saved key is never redirected to another device", async () => {
    expect((await post({ name: "Keyed", url: "https://keyed.example", token: "cgw_secret-token-value" })).status).toBe(201);
    const r = await reg.request("/api/gateways/keyed/open", { headers: { "x-forwarded-for": "198.51.100.6" } });
    expect(r.status).toBe(403);
    expect(r.headers.get("location")).toBeNull();
    await reg.request("/api/gateways/keyed", { method: "DELETE" });
  });
});

describe("connections registry consistency check", () => {
  const g = (id: string, name: string, url: string): Gateway => ({ id, name, url, kind: "vps" });
  const read = (p: string) => readFileSync(join(import.meta.dir, "..", p), "utf8");

  test("a whole list obeys the same rules as adding one", () => {
    expect(registryProblem([g("a", "A", "https://a.example/"), g("b", "B", "https://b.example")])).toBeNull();
    expect(registryProblem([g("a", "A", "https://a.example"), g("a", "B", "https://b.example")])).toBe("id_duplicate");
    expect(registryProblem([g("this-device", "A", "https://a.example")])).toBe("id_duplicate");
    expect(registryProblem([g("a", "A", "https://a.example"), g("b", "a", "https://b.example")])).toBe("name_duplicate");
    expect(registryProblem([g("a", "A", "https://a.example"), g("b", "B", "https://a.example/")])).toBe("url_duplicate");
    expect(registryProblem([g("a", "This device", "https://a.example")])).toBe("name_reserved");
    expect(registryProblem([g("a", "A", "http://public.example")])).toBe("url_plain_http");
  });

  test("the settings route refuses a list the registry would refuse, and drops the key of a moved or removed entry", async () => {
    const { app: core } = await import("../core/server") as unknown as { app: Hono };
    const send = (method: string, path: string, body: unknown) => core.request(path, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const made = await (await send("POST", "/api/gateways", { name: "Moved", url: "https://old.example", token: "cgw_secret-token-value" })).json() as Gateway;
    const bad = await send("PUT", "/api/settings", { gateways: [g("x", "X", "http://public.example")] });
    expect([bad.status, await bad.json()]).toEqual([400, { error: "url_plain_http" }]);
    expect((await send("PUT", "/api/settings", { gateways: [{ ...made, url: "https://new.example" }] })).status).toBe(200);
    const list = await (await core.request("/api/gateways")).json() as { gateways: { id: string; hasToken: boolean }[] };
    expect(list.gateways).toMatchObject([{ id: made.id, hasToken: false }]);
    await send("PUT", "/api/settings", { gateways: [] });
  });

  test("every error the registry can return has words on the page, and the caps agree with the native shell", () => {
    const source = read("core/gateways.ts").split("export function cleanUrl")[1]!.split("export const validToken")[0]!, page = read("web/atrium/gateway.js");
    const codes = [...new Set([...source.matchAll(/error: "((?:name|url|token|too)_[a-z_]+)"/g)].map((m) => m[1]!))];
    expect(codes.length).toBeGreaterThan(8);
    for (const code of codes) expect(page).toContain(`${code}: '`);
    const rustCap = Number(read("src-tauri/logic/src/picker.rs").match(/MAX_GATEWAYS: usize = (\d+)/)?.[1]);
    const full = Array.from({ length: rustCap }, (_, i) => g(`g${i}`, `N${i}`, `https://h${i}.example`));
    expect(addGateway(full, { name: "one more", url: "https://more.example" })).toEqual({ error: "too_many" });
    expect(Settings.safeParse({ gateways: full }).success).toBe(true);
    expect(Settings.safeParse({ gateways: [...full, g("z", "Z", "https://z.example")] }).success).toBe(false);
  });

  test("the claim on the Gateway page matches the native shell: its picker refuses plain http off this device", () => {
    expect(read("src-tauri/logic/src/gateway.rs")).toContain('if url.scheme() == "http" && !is_loopback_host(&host)');
    expect(read("web/atrium/gateway.js")).toContain("the desktop app's gateway picker");
    expect(read("README.md")).toContain("tailscale serve");
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
