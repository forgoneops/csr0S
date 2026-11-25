// Who may do what with the computer layer: the person arms, stops and reads the audit; an agent holding a token scoped
// "computer" may only use the action calls, and only while armed; any other agent token gets nothing.
import { beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.CAESAROS_DATA = mkdtempSync(join(tmpdir(), "caesaros-compagent-"));
process.env.CAESAROS_MODULE_DIRS = "plugins";
type App = { request: (path: string, init?: RequestInit) => Promise<Response> };
let app: App; let computerToken = ""; let generalToken = "";
const operator = { "content-type": "application/json", "sec-fetch-site": "same-origin", origin: "http://127.0.0.1:4410", host: "127.0.0.1:4410" };
const as = (t: string) => ({ "content-type": "application/json", authorization: `Bearer ${t}` });

beforeAll(async () => {
  ({ app } = await import("../core/server") as unknown as { app: App });
  const { access } = await import("../core/principal");
  computerToken = access.issueScoped("computer", ["computer"], 3_600_000);
  generalToken = access.issue("someagent");
});

describe("computer layer access", () => {
  test("a computer token reaches the action calls, but only the person arms, stops, reads the audit or issues the token", async () => {
    const wrong = await app.request("/api/computer/type", { method: "POST", headers: as(computerToken), body: JSON.stringify({ address: "0xdeadbeef", text: "x" }) });
    expect(await wrong.json()).toEqual({ error: "not_armed" });                    // reached the layer, refused because it is off
    for (const [method, path] of [["POST", "/api/computer/arm"], ["POST", "/api/computer/stop"], ["GET", "/api/computer/audit"], ["POST", "/api/computer/token"]] as const) {
      const r = await app.request(path, { method, headers: as(computerToken), body: method === "POST" ? "{\"on\":true}" : undefined });
      expect([r.status, ((await r.json()) as { error?: string }).error]).toEqual([403, "operator only"]);
    }
  });
  test("an agent token without the computer scope, and a request with no token, are refused", async () => {
    for (const headers of [as(generalToken), { "content-type": "application/json" }]) {
      const r = await app.request("/api/computer/windows", { headers });
      expect(r.status).toBe(403);
    }
  });
  test("the person arms and stops; Stop makes the agent's calls refuse again", async () => {
    expect((await app.request("/api/computer/arm", { method: "POST", headers: operator, body: JSON.stringify({ on: true, ttlSeconds: 60 }) })).status).toBe(200);
    const during = await app.request("/api/computer/type", { method: "POST", headers: as(computerToken), body: JSON.stringify({ address: "0xdeadbeef", text: "x" }) });
    expect(((await during.json()) as { error: string }).error).not.toBe("not_armed");   // armed: the next check (focus) decides
    expect((await app.request("/api/computer/stop", { method: "POST", headers: operator })).status).toBe(200);
    const after = await app.request("/api/computer/type", { method: "POST", headers: as(computerToken), body: JSON.stringify({ address: "0xdeadbeef", text: "x" }) });
    expect(((await after.json()) as { error: string }).error).toBe("not_armed");
  });
});
