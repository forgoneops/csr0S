import { expect, test } from "bun:test";
import { Hono } from "hono";
import { cleanUrl, newCode, pairingApi, plainHttpOk, redeem } from "../core/pairing";

const app = () => { const a = new Hono(); pairingApi(a, () => true); return a; };
const put = (a: Hono, b: object) => a.request("/api/pairing", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });

test("no code is made while the device is not visible", async () => {
  await put(app(), { visible: false });
  expect(newCode()).toEqual({ error: "not_visible" });
});
test("a code works once, with a name, and the device is listed", async () => {
  const a = app(); await put(a, { visible: true });
  const c = newCode() as { code: string };
  expect(redeem(c.code, "  ")).toEqual({ ok: false, error: "name" });
  const r = redeem(c.code, "Phone"); expect(r.ok).toBe(true);
  expect(redeem(c.code, "Again")).toEqual({ ok: false, error: "no_code" });
  const list = await (await a.request("/api/pairing")).json() as { devices: { name: string }[] };
  expect(list.devices.some((d) => d.name === "Phone")).toBe(true);
});
test("five wrong tries burn the code and an expired code is refused", async () => {
  await put(app(), { visible: true });
  const c = newCode(1000) as { code: string };
  for (let i = 0; i < 5; i++) expect(redeem("000000", "x", 2000)).toEqual({ ok: false, error: "wrong" });
  expect(redeem(c.code, "x", 2000)).toEqual({ ok: false, error: "no_code" });
  const d = newCode(1000) as { code: string };
  expect(redeem(d.code, "x", 1000 + 6 * 60_000)).toEqual({ ok: false, error: "no_code" });
});
test("joining talks to the other core and records it; a bad address is refused", async () => {
  const a = new Hono(); pairingApi(a, () => true, (async () => new Response(JSON.stringify({ ok: true, name: "Desktop" }))) as never);
  const j = (b: object) => a.request("/api/pairing/join", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
  expect((await j({ url: "ftp://x", code: "1" })).status).toBe(400);
  expect((await j({ url: `http://${[100, 64, 0, 2].join(".")}:4410`, code: "123456" })).status).toBe(200);
  const list = await (await a.request("/api/pairing")).json() as { devices: { name: string; role: string }[] };
  expect(list.devices.some((d) => d.name === "Desktop" && d.role === "i-joined")).toBe(true);
});

test("a key travels over plain http only on this machine, a private network or a tailnet (audit defect 7)", () => {
  const ip = (...n: number[]) => n.join(".");
  for (const h of ["localhost", ip(127, 0, 0, 1), ip(192, 168, 1, 4), ip(10, 0, 0, 2), ip(172, 20, 1, 1), ip(100, 64, 0, 2), "box.local", "box.tailnet.ts.net"]) expect(plainHttpOk(h)).toBe(true);
  for (const h of ["example.com", ip(8, 8, 8, 8), ip(100, 200, 1, 1), ip(172, 32, 0, 1)]) expect(plainHttpOk(h)).toBe(false);
  expect(cleanUrl("http://example.com:4410")).toBeNull();
  expect(cleanUrl("https://example.com")).toBe("https://example.com");
  expect(cleanUrl(`http://${ip(100, 64, 0, 2)}:4410`)).toBe(`http://${ip(100, 64, 0, 2)}:4410`);
  expect(cleanUrl(`http://u:p@${ip(127, 0, 0, 1)}`)).toBeNull();
});
