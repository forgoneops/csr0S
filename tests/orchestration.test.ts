// Plan 7.11, the orchestration view: one honest state per crew member, and the route that serves it to the operator.
// The pure function is given what the core knows; a state is only claimed when its signal is there.
import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { memberOfEngine, orchestration, orchestrationApi } from "../core/orchestration";

process.env.CAESAROS_DATA = mkdtempSync(join(tmpdir(), "caesaros-orch-"));

const now = 1_700_000_000_000;
const crew = [
  { id: "caesar", name: "Caesar", role: "Commander" },
  { id: "vitruvius", name: "Vitruvius", role: "Developer" },
  { id: "varro", name: "Varro", role: "Librarian" },
];
const nothing = { crew, running: [], approvals: [], sessions: [] };
const row = (id: string, out = orchestration(nothing, now)) => out.members.find((m) => m.id === id)!;

describe("orchestration: one honest state per crew member", () => {
  test("empty input is an empty list, not an invented one", () => {
    expect(orchestration({ crew: [], running: [], approvals: [], sessions: [] }, now)).toEqual({ members: [], needsYou: 0 });
  });

  test("idle when no signal exists at all", () => {
    expect(row("caesar")).toMatchObject({ id: "caesar", name: "Caesar", state: "idle", doing: "", ms: null });
    expect(orchestration(nothing, now).needsYou).toBe(0);
  });

  test("needs-you: a waiting approval on that member's session, with its first words and how long", () => {
    const out = orchestration({
      ...nothing,
      approvals: [{ title: "Send the report to Annona", at: now - 120_000, sessionId: "s-varro" }],
      sessions: [{ id: "s-varro", engine: "hermes:varro", updatedAt: now - 100_000, last: { status: "complete", at: now - 100_000, text: "Done.", error: null } }],
    }, now);
    expect(out.needsYou).toBe(1);
    expect(row("varro", out)).toMatchObject({ state: "needs-you", doing: "Send the report to Annona", ms: 120_000, sessionId: "s-varro" });
  });

  test("running: a turn in flight, from the crew's working map", () => {
    const out = orchestration({ ...nothing, running: [{ id: "vitruvius", doing: "Fix the chat route", at: now - 5_000 }] }, now);
    expect(row("vitruvius", out)).toMatchObject({ state: "running", doing: "Fix the chat route", ms: 5_000 });
    expect(row("caesar", out).state).toBe("idle");
  });

  test("failed: the last answer of the newest session has status error, and the error is what it says", () => {
    const out = orchestration({
      ...nothing,
      sessions: [{ id: "s1", engine: "hermes:caesar", updatedAt: now - 60_000, last: { status: "error", at: now - 60_000, text: "half an", error: "Hermes exited 1: no model" } }],
    }, now);
    expect(row("caesar", out)).toMatchObject({ state: "failed", doing: "Hermes exited 1: no model", ms: 60_000, sessionId: "s1" });
  });

  test("done: the newest session ended complete within the last ten minutes, not after", () => {
    const within = { id: "s1", engine: "hermes:caesar", updatedAt: now - 60_000, last: { status: "complete", at: now - 60_000, text: "The build passed.", error: null } };
    expect(row("caesar", orchestration({ ...nothing, sessions: [within] }, now))).toMatchObject({ state: "done", doing: "The build passed." });
    const old = { ...within, updatedAt: now - 11 * 60_000, last: { status: "complete", at: now - 11 * 60_000, text: "The build passed.", error: null } };
    expect(row("caesar", orchestration({ ...nothing, sessions: [old] }, now)).state).toBe("idle");
  });

  test("ties: needs-you beats running, running beats failed and done, failed beats done", () => {
    const sessions = [{ id: "s1", engine: "hermes:caesar", updatedAt: now - 1_000, last: { status: "complete", at: now - 1_000, text: "ok", error: null } }];
    const failedSessions = [{ id: "s1", engine: "hermes:caesar", updatedAt: now - 1_000, last: { status: "error" as const, at: now - 1_000, text: "", error: "boom" } }];
    const running = [{ id: "caesar", doing: "thinking", at: now - 1_000 }];
    expect(row("caesar", orchestration({ ...nothing, running, sessions }, now)).state).toBe("running");
    expect(row("caesar", orchestration({ ...nothing, running, sessions: failedSessions }, now)).state).toBe("running");
    expect(row("caesar", orchestration({ ...nothing, sessions: failedSessions }, now)).state).toBe("failed");
    expect(row("caesar", orchestration({ ...nothing, sessions, approvals: [{ title: "Post it", at: now, sessionId: "s1" }] }, now)).state).toBe("needs-you");
  });

  test("the newest session per engine wins, and an engine that is no crew member is left out", () => {
    const out = orchestration({
      ...nothing,
      sessions: [
        { id: "old", engine: "hermes:caesar", updatedAt: now - 300_000, last: { status: "error", at: now - 300_000, text: "", error: "old failure" } },
        { id: "new", engine: "hermes:caesar", updatedAt: now - 1_000, last: { status: "complete", at: now - 1_000, text: "all good", error: null } },
        { id: "tool", engine: "claude", updatedAt: now, last: { status: "complete", at: now, text: "hi", error: null } },
      ],
    }, now);
    expect(row("caesar", out)).toMatchObject({ state: "done", sessionId: "new" });
    expect(out.members.map((m) => m.id)).toEqual(["caesar", "vitruvius", "varro"]);
  });

  test("an approval with no conversation is not pinned on anyone", () => {
    expect(orchestration({ ...nothing, approvals: [{ title: "Restart the server", at: now }] }, now).needsYou).toBe(0);
  });

  test("Caesar alone is still Caesar", () => {
    expect(memberOfEngine("hermes:caesar!alone")).toBe("caesar");
    expect(memberOfEngine("hermes:caesar")).toBe("caesar");
    expect(memberOfEngine("hermes:vitruvius")).toBe("vitruvius");
    expect(memberOfEngine("claude")).toBe("");
  });
});

describe("GET /api/orchestration is the operator's", () => {
  test("a non-operator is refused and the operator gets the list and the count", async () => {
    const app = new Hono();
    orchestrationApi(app, (c) => c.req.header("x-op") === "1");
    expect((await app.request("/api/orchestration")).status).toBe(403);
    const ok = await app.request("/api/orchestration", { headers: { "x-op": "1" } });
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { members: unknown[]; needsYou: number };
    expect(Array.isArray(body.members)).toBe(true);
    expect(typeof body.needsYou).toBe("number");
  });

  test("the real core refuses a request with no operator behind it", async () => {
    const { app } = await import("../core/server") as unknown as { app: { request: (path: string, init?: RequestInit) => Promise<Response> } };
    const r = await app.request("/api/orchestration");
    expect([401, 403, 421]).toContain(r.status);
  });
});
