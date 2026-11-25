import { expect, test } from "bun:test";
import { Hono } from "hono";
import { gatewayApi } from "../core/gateway-api";
import type { EngineAdapter } from "../core/engines";

const echo: EngineAdapter = {
  id: "echo", label: "Echo",
  health: async () => ({ ok: true, detail: null }),
  models: async () => [{ id: "m1", label: "M1" }],
  async *stream(msgs) { yield { type: "delta", text: "hi " }; yield { type: "delta", text: msgs.at(-1)!.content }; yield { type: "done" }; },
};
const make = (agent = true, loopback = true) => { const a = new Hono(); gatewayApi(a, { isAgent: () => agent, engines: () => [echo], pick: (i) => (i === "echo" ? echo : undefined), loopback: () => loopback }); return a; };
const post = (a: Hono, b: object) => a.request("/v1/chat/completions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });

test("no agent token means 401, a non-loopback caller 403", async () => {
  expect((await make(false).request("/v1/models")).status).toBe(401);
  expect((await make(true, false).request("/v1/models")).status).toBe(403);
});
test("a proxied host name is refused even from a loopback socket", async () => {
  const a = make(); const r = await a.request("/v1/models", { headers: { host: "desktop.example.net" } });
  expect(r.status).toBe(403);
});
test("models are listed as engine/model", async () => {
  const j = await (await make().request("/v1/models")).json() as { data: { id: string }[] };
  expect(j.data.map((m) => m.id)).toEqual(["echo/m1"]);
});
test("a non-streaming completion returns the joined text", async () => {
  const j = await (await post(make(), { model: "echo/m1", messages: [{ role: "user", content: "yo" }] })).json() as { choices: { message: { content: string } }[] };
  expect(j.choices[0]!.message.content).toBe("hi yo");
});
test("streaming ends with [DONE]", async () => {
  const t = await (await post(make(), { model: "echo/m1", stream: true, messages: [{ role: "user", content: "yo" }] })).text();
  expect(t).toContain('"content":"yo"'); expect(t.trimEnd().endsWith("data: [DONE]")).toBe(true);
});
test("an unknown engine is 404 and empty messages 400", async () => {
  expect((await post(make(), { model: "nope/x", messages: [{ role: "user", content: "a" }] })).status).toBe(404);
  expect((await post(make(), { model: "echo/m1", messages: [] })).status).toBe(400);
});

// Local only (plan 7.8): the gateway used to hand a prompt to a cloud engine while the switch was on (independent review, 2026-11-23)
test("with Local only on, a cloud engine is neither listed nor answered; a local one still is", async () => {
  const cloud: EngineAdapter = { ...echo, id: "cloud1", scope: () => "cloud" }, local: EngineAdapter = { ...echo, id: "loc1", scope: () => "local" };
  const a = new Hono(); gatewayApi(a, { isAgent: () => true, localOnly: () => true, engines: () => [cloud, local], pick: (i) => [cloud, local].find((e) => e.id === i), loopback: () => true });
  const list = await (await a.request("/v1/models")).json() as { data: { id: string }[] };
  expect(list.data.map((m) => m.id)).toEqual(["loc1/m1"]);
  expect((await post(a, { model: "cloud1/m1", messages: [{ role: "user", content: "x" }] })).status).toBe(409);
  expect((await post(a, { model: "loc1/m1", messages: [{ role: "user", content: "x" }] })).status).toBe(200);
});
