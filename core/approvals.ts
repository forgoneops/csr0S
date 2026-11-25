// The approvals host: somewhere a module can ask the person before it acts, and the record of what they answered.
// Nothing registers yet, so a fresh install has no pending approvals and the UI renders nothing for them.
// An approval may be tied to one conversation (sessionId). It can then only be answered from that conversation:
// a card from one session cannot be answered as another. Only the operator decides; an agent never does.
import { Hono } from "hono";

export type Approval = { id: string; title: string; detail?: string; sessionId?: string; askedAt: number };
export type Decision = "approved" | "denied";
export type Settled = Omit<Approval, "askedAt"> & { decision: Decision; at: number };

const pending = new Map<string, Approval>();
const settled: Settled[] = [];                 // newest last, kept to 100: the action record
const waiters = new Map<string, ((d: Decision) => void)[]>();
const HISTORY = 100;

export const approvals = {
  ask(a: Omit<Approval, "askedAt">): void { pending.set(a.id, { ...a, askedAt: Date.now() }); },
  list(): Approval[] { return [...pending.values()]; }, // a Map keeps insertion order: oldest first
  /** Answered by the person: the approval leaves the pending list, joins the record, and wakes whoever waits on it. */
  decide(id: string, decision: Decision, sessionId?: string): "ok" | "unknown" | "wrong-session" {
    const a = pending.get(id);
    if (!a) return "unknown";
    if (a.sessionId && a.sessionId !== sessionId) return "wrong-session";
    pending.delete(id);
    const { askedAt: _asked, ...card } = a;
    settled.push({ ...card, decision, at: Date.now() });
    if (settled.length > HISTORY) settled.shift();
    for (const w of waiters.get(id) ?? []) w(decision);
    waiters.delete(id);
    return "ok";
  },
  /** For the asker: resolves with the person's answer. */
  wait(id: string): Promise<Decision> { return new Promise((res) => waiters.set(id, [...(waiters.get(id) ?? []), res])); },
  record(): Settled[] { return [...settled].reverse(); },
  settle(id: string): boolean { return pending.delete(id); },
  clear(): void { pending.clear(); settled.length = 0; waiters.clear(); },
};

export function approvalsApi(isOperator: (c: import("hono").Context) => boolean = () => false): Hono {
  const api = new Hono();
  api.get("/", (c) => c.json({ pending: approvals.list() }));
  api.get("/record", (c) => c.json({ settled: approvals.record() }));
  api.post("/:id/decision", async (c) => {
    if (!isOperator(c)) return c.json({ error: "operator_only" }, 403);
    const body = (await c.req.json().catch(() => ({}))) as { decision?: unknown; sessionId?: unknown };
    if (body.decision !== "approved" && body.decision !== "denied") return c.json({ error: "decision must be approved or denied" }, 400);
    const r = approvals.decide(c.req.param("id"), body.decision, typeof body.sessionId === "string" ? body.sessionId : undefined);
    if (r === "unknown") return c.json({ error: "no such approval" }, 404);
    if (r === "wrong-session") return c.json({ error: "wrong-session", message: "this approval belongs to another conversation" }, 409);
    return c.json({ ok: true });
  });
  return api;
}
