// The orchestration view (plan 7.11): what every crew member is doing, in one honest state each.
// A state is claimed only when the signal for it exists; nothing here starts a turn or invents activity.
//   needs-you  a waiting approval on that member's conversation
//   running    a turn in flight (the crew's working map)
//   failed     the last answer of its newest session has status error
//   done       that answer ended complete within the last ten minutes
//   idle       no signal
import type { Hono } from "hono";
import { approvals } from "./approvals";
import { lastAnswerByEngine } from "./chat";
import { listCrew } from "./crew";

export type OrchState = "needs-you" | "running" | "failed" | "done" | "idle";
export type OrchCrew = { id: string; name: string; role: string };
export type OrchRunning = { id: string; doing: string; at: number };
export type OrchApproval = { title: string; at: number; sessionId?: string };
export type OrchSession = { id: string; engine: string; updatedAt: number; last: { status: string; at: number; text: string; error: string | null } | null };
export type OrchInput = { crew: OrchCrew[]; running: OrchRunning[]; approvals: OrchApproval[]; sessions: OrchSession[] };
export type OrchRow = { id: string; name: string; role: string; state: OrchState; doing: string; ms: number | null; sessionId?: string };

/** `hermes:caesar` and `hermes:caesar!alone` are Caesar; an engine that is no crew member is "". */
export function memberOfEngine(engine: string): string {
  const m = /^hermes:([a-z0-9_-]+)/i.exec(engine);
  return m ? m[1] : "";
}

const words = (s: string, n = 60): string => { const t = (s || "").replace(/\s+/g, " ").trim(); return t.length > n ? `${t.slice(0, n).trimEnd()}…` : t; };

const DONE_WITHIN = 10 * 60_000;

export function orchestration(input: OrchInput, now: number, doneWithinMs = DONE_WITHIN): { members: OrchRow[]; needsYou: number } {
  const memberOfSession = new Map(input.sessions.map((s) => [s.id, memberOfEngine(s.engine)]));
  const newest = new Map<string, OrchSession>();
  for (const s of input.sessions) {
    const m = memberOfEngine(s.engine);
    if (!m) continue;
    const seen = newest.get(m);
    if (!seen || s.updatedAt > seen.updatedAt) newest.set(m, s);
  }
  const runningOf = new Map(input.running.map((r) => [r.id, r]));
  // the oldest waiting card per member: it is the one that has waited longest
  const askOf = new Map<string, OrchApproval & { sessionId: string }>();
  for (const a of input.approvals) {
    const m = a.sessionId ? memberOfSession.get(a.sessionId) ?? "" : "";
    if (m && !askOf.has(m)) askOf.set(m, a as OrchApproval & { sessionId: string });
  }
  const members = input.crew.map((c): OrchRow => {
    const ask = askOf.get(c.id);
    if (ask) return { ...c, state: "needs-you", doing: words(ask.title), ms: Math.max(0, now - ask.at), sessionId: ask.sessionId };
    const run = runningOf.get(c.id);
    if (run) return { ...c, state: "running", doing: words(run.doing), ms: Math.max(0, now - run.at) };
    const s = newest.get(c.id), last = s?.last;
    if (s && last) {
      if (last.status === "error") return { ...c, state: "failed", doing: words(last.error || last.text), ms: Math.max(0, now - last.at), sessionId: s.id };
      if (last.status === "complete" && now - last.at <= doneWithinMs) return { ...c, state: "done", doing: words(last.text), ms: Math.max(0, now - last.at), sessionId: s.id };
    }
    return { ...c, state: "idle", doing: "", ms: null };
  });
  return { members, needsYou: members.filter((m) => m.state === "needs-you").length };
}

/** GET /api/orchestration: the list and the needs-you count. The operator's alone, because it names who works on what. */
export function orchestrationApi(app: Hono, isOperator: (c: import("hono").Context) => boolean = () => false): void {
  app.get("/api/orchestration", (c) => {
    if (!isOperator(c)) return c.json({ error: "operator_only" }, 403);
    const crew = listCrew();
    return c.json(orchestration({
      crew: crew.map(({ id, name, role }) => ({ id, name, role })),
      running: crew.flatMap((m) => (m.at === null ? [] : [{ id: m.id, doing: m.doing, at: m.at }])),
      approvals: approvals.list().map((a) => ({ title: a.title, at: a.askedAt, sessionId: a.sessionId })),
      sessions: lastAnswerByEngine(),
    }, Date.now()));
  });
}
