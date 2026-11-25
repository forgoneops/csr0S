// Cards made by an agent through the layer: scoped token, own cards only, no close without evidence, no delete.
import { describe, expect, test } from "bun:test";

const { app } = await import("../core/server") as unknown as { app: { request: (path: string, init?: RequestInit) => Promise<Response> } };
const { access } = await import("../core/principal");
const tok = access.issueScoped("agent", ["board"], 60 * 60 * 1000), other = access.issueScoped("agent", ["notes"], 60 * 60 * 1000);
const call = (path: string, method: string, body?: unknown, token = tok) => app.request(path, { method, headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

describe("Board for agents", () => {
  test("a token without the board scope is refused", async () => {
    expect((await call("/api/board/agent", "GET", undefined, other)).status).toBe(403);
    expect((await app.request("/api/board/agent")).status).toBe(403);
  });
  test("add, move, and the evidence rule", async () => {
    const r = await call("/api/board/agent", "POST", { title: "Wire the sync", agent: "claude-code", status: "doing" });
    expect(r.status).toBe(201);
    const t = await r.json() as { id: string; by: string; status: string };
    expect(t.by).toBe("claude-code"); expect(t.status).toBe("doing");
    expect((await call("/api/board/agent/" + t.id, "PUT", { agent: "claude-code", status: "done" })).status).toBe(400);
    const done = await call("/api/board/agent/" + t.id, "PUT", { agent: "claude-code", status: "done", evidence: "bun test: 12 pass" });
    expect(done.status).toBe(200); expect((await done.json() as { status: string }).status).toBe("done");
  });
  test("an agent cannot change the owner's card or another agent's", async () => {
    const mine = await (await app.request("/api/board", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "Owner card" }) })).json() as { id: string };
    expect((await call("/api/board/agent/" + mine.id, "PUT", { agent: "claude-code", status: "doing" })).status).toBe(403);
    const a = await (await call("/api/board/agent", "POST", { title: "A's card", agent: "codex" })).json() as { id: string };
    expect((await call("/api/board/agent/" + a.id, "PUT", { agent: "claude-code", status: "doing" })).status).toBe(403);
    expect((await call("/api/board/agent", "POST", { title: "  " })).status).toBe(400);
  });
});

describe("caesar_dag route", () => {
  test("a plan becomes cards that wait for each other; a bad plan adds nothing", async () => {
    const before = (await (await call("/api/board/agent", "GET")).json() as unknown[]).length;
    const bad = await call("/api/board/agent/dag", "POST", { agent: "claude-code", nodes: [{ key: "a", task: "x", deliverable: "d", verify: "v", stop: "s", after: ["nope"] }] });
    expect(bad.status).toBe(400);
    expect((await (await call("/api/board/agent", "GET")).json() as unknown[]).length).toBe(before);
    const nodes = [{ key: "b", task: "second", deliverable: "d", verify: "v", stop: "s", after: ["a"] }, { key: "a", task: "first", deliverable: "d", verify: "v", stop: "s", scope: ["src"] }];
    const ok = await call("/api/board/agent/dag", "POST", { agent: "claude-code", nodes });
    expect(ok.status).toBe(201);
    const { cards } = await ok.json() as { cards: { id: string; title: string; after: string; note: string; by: string }[] };
    expect(cards.map((c) => c.title)).toEqual(["first", "second"]);
    expect(cards[1].after).toBe(cards[0].id); expect(cards[0].note).toContain("SCOPE: src"); expect(cards[1].by).toBe("claude-code");
  });
});
