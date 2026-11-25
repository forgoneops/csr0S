import { expect, test } from "bun:test";
import { Hono } from "hono";
import { authApi, authEnabled, authGate, checkPassword, clearPassword, newSession, noteFail, noteOk, setPassword, throttled, validSession } from "../core/auth";

const app = () => {
  const a = new Hono(); a.use("*", authGate()); authApi(a, () => true);
  a.get("/api/secret", (c) => c.json({ ok: true })); a.get("/", (c) => c.text("home"));
  return a;
};
const json = (b: object, m = "POST") => ({ method: m, headers: { "content-type": "application/json" }, body: JSON.stringify(b) });

test("nothing changes until a password is set; a short one is refused", async () => {
  clearPassword();
  expect(authEnabled()).toBe(false);
  expect((await app().request("/api/secret")).status).toBe(200);
  expect(setPassword("short")).toBe("short"); expect(authEnabled()).toBe(false);
});
test("with a password the page redirects to the login, the API says login_required, agents and open paths still pass", async () => {
  const a = app(); expect(setPassword("correct horse battery")).toBe("ok");
  const page = await a.request("/"); expect(page.status).toBe(302); expect(page.headers.get("location")).toBe("/login");
  const api = await a.request("/api/secret"); expect(api.status).toBe(401); expect(await api.json()).toEqual({ error: "login_required" });
  expect((await a.request("/login")).status).toBe(200);
  expect((await a.request("/api/auth/status")).status).toBe(200);
  expect((await a.request("/api/secret", { headers: { authorization: "Bearer cae_x_y" } })).status).toBe(200);   // the route checks the key itself
  clearPassword();
});
test("login sets a session cookie that opens the API; a wrong password does not, and five wrong ones slow the next", async () => {
  const a = app(); setPassword("correct horse battery");
  const bad = await a.request("/api/login", json({ password: "nope nope nope" })); expect(bad.status).toBe(401);
  const ok = await a.request("/api/login", json({ password: "correct horse battery" })); expect(ok.status).toBe(200);
  const cookie = ok.headers.get("set-cookie")!; expect(cookie).toContain("HttpOnly"); expect(cookie).toContain("SameSite=Strict");
  const token = /cs=([^;]+)/.exec(cookie)![1]!;
  expect(validSession(token)).toBe(true);
  expect((await a.request("/api/secret", { headers: { cookie: `cs=${token}` } })).status).toBe(200);
  expect((await a.request("/api/secret", { headers: { cookie: "cs=forged" } })).status).toBe(401);
  for (let i = 0; i < 5; i++) noteFail("addr"); expect(throttled("addr")).toBe(true); noteOk("addr"); expect(throttled("addr")).toBe(false);
  clearPassword();
});
test("changing needs the current password, switching off needs it too, and the hash is not the password", async () => {
  clearPassword();
  const a = app(); expect((await a.request("/api/auth", json({ password: "first password 1" }, "PUT"))).status).toBe(200);
  const login = await a.request("/api/login", json({ password: "first password 1" }));
  const h = { "content-type": "application/json", cookie: `cs=${/cs=([^;]+)/.exec(login.headers.get("set-cookie")!)![1]}` };
  const put = (b: object) => a.request("/api/auth", { method: "PUT", headers: h, body: JSON.stringify(b) });
  const del = (b: object) => a.request("/api/auth", { method: "DELETE", headers: h, body: JSON.stringify(b) });
  expect((await a.request("/api/auth", json({ password: "second password 2" }, "PUT"))).status).toBe(401);   // not logged in: the gate stops it
  expect((await put({ password: "second password 2" })).status).toBe(403);                                   // logged in, but the current password is missing
  expect((await put({ password: "second password 2", current: "first password 1" })).status).toBe(200);
  expect(checkPassword("second password 2")).toBe(true); expect(checkPassword("first password 1")).toBe(false);
  expect((await del({ current: "wrong" })).status).toBe(401);                                              // changing the password ended the old session
  const login2 = await a.request("/api/login", json({ password: "second password 2" }));
  h.cookie = `cs=${/cs=([^;]+)/.exec(login2.headers.get("set-cookie")!)![1]}`;
  expect((await del({ current: "wrong" })).status).toBe(403);
  expect((await del({ current: "second password 2" })).status).toBe(200);
  expect(authEnabled()).toBe(false);
});
test("a session expires", () => { const t = newSession(1000); expect(validSession(t, 1000 + 31 * 86_400_000)).toBe(false); });
