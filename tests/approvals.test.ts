// The approval host: pending list, an answer that moves it to the record, and the rule that a card from one
// conversation cannot be answered as another.
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { approvals } from "../core/approvals";

process.env.CAESAROS_DATA = mkdtempSync(join(tmpdir(), "caesaros-appr-"));
process.env.CAESAROS_MODULE_DIRS = "plugins";
type App = { request: (path: string, init?: RequestInit) => Promise<Response> };
const { app } = await import("../core/server") as unknown as { app: App };
const decide = (id: string, body: object) => app.request(`/api/approvals/${id}/decision`, { method: "POST", headers: { "content-type": "application/json", "sec-fetch-site": "same-origin", origin: "http://127.0.0.1:4410", host: "127.0.0.1:4410" }, body: JSON.stringify(body) });

beforeEach(() => approvals.clear());
afterAll(() => approvals.clear());   // the host is shared by every test file in the run

describe("approvals", () => {
  test("an answer leaves the pending list, joins the record and wakes the asker", async () => {
    approvals.ask({ id: "a1", title: "Send the mail", sessionId: "s1" });
    const waiting = approvals.wait("a1");
    expect((await decide("a1", { decision: "approved", sessionId: "s1" })).status).toBe(200);
    expect(await waiting).toBe("approved");
    expect(approvals.list()).toEqual([]);
    const rec = (await (await app.request("/api/approvals/record")).json()) as { settled: { id: string; decision: string }[] };
    expect(rec.settled[0]).toMatchObject({ id: "a1", decision: "approved" });
  });
  test("a card tied to one conversation is refused from another, and stays pending", async () => {
    approvals.ask({ id: "a2", title: "Delete", sessionId: "s1" });
    expect((await decide("a2", { decision: "approved", sessionId: "other" })).status).toBe(409);
    expect((await decide("a2", { decision: "approved" })).status).toBe(409);
    expect(approvals.list()).toHaveLength(1);
  });
  test("an approval with no conversation can be answered from anywhere; bad input and unknown ids are refused", async () => {
    approvals.ask({ id: "a3", title: "System thing" });
    expect((await decide("a3", { decision: "maybe" })).status).toBe(400);
    expect((await decide("nope", { decision: "denied" })).status).toBe(404);
    expect((await decide("a3", { decision: "denied", sessionId: "s9" })).status).toBe(200);
  });
  test("an agent token never decides", async () => {
    approvals.ask({ id: "a4", title: "x" });
    const r = await app.request("/api/approvals/a4/decision", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer not-a-token", host: "127.0.0.1:4410" }, body: JSON.stringify({ decision: "approved" }) });
    expect([401, 403]).toContain(r.status);
    expect(approvals.list()).toHaveLength(1);
  });
});
