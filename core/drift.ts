// Board drift (plan 3.3a): where the plan and what really happens have come apart, as short bullets with a one-tap fix.
// A card is a plan item; its state comes from what was observed (a live run, evidence written down), not from where it was dragged.
// Only what this install can observe is checked: the cards, their age and evidence, and whether anything is running.
import type { Hono } from "hono";
import { addTask, listTasks, updateTask, removeTask, type Task } from "./board";
import { running } from "./running";

const DAY = 864e5, STALE_DOING = 3 * DAY, UNPICKED = 14 * DAY, RECENT_DONE = 30 * DAY;
export type DriftKind = "no-evidence" | "stale" | "unpicked" | "duplicate" | "no-card";
export type Drift = { kind: DriftKind; taskId?: string; title?: string; days?: number; text: string; fix: { label: string } };
export type CardState = "planned" | "started" | "observed" | "verified" | "claimed";

/** planned (To do), started (Doing), observed (Doing while something runs), verified (Done with evidence), claimed (Done with none). */
export const stateOf = (t: Task, runningNow: number): CardState =>
  t.status === "todo" ? "planned" : t.status === "doing" ? (runningNow > 0 ? "observed" : "started") : t.evidence.trim() ? "verified" : "claimed";

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

export function detectDrift(tasks: Task[], ctx: { now: number; running: number }): Drift[] {
  const out: Drift[] = [], seen = new Map<string, Task>();
  for (const t of [...tasks].sort((a, b) => a.created - b.created)) {
    const key = t.status + "\0" + norm(t.title), first = seen.get(key);
    if (first) { out.push({ kind: "duplicate", taskId: t.id, title: t.title, text: `"${t.title}" is on the board twice.`, fix: { label: "Remove the newer one" } }); continue; }
    seen.set(key, t);
    if (t.status === "done" && !t.evidence.trim() && ctx.now - t.updated < RECENT_DONE) out.push({ kind: "no-evidence", taskId: t.id, title: t.title, text: `"${t.title}" is done, but nothing shows it was checked.`, fix: { label: "Reopen it" } });
    else if (t.status === "doing" && ctx.now - t.updated > STALE_DOING) out.push({ kind: "stale", taskId: t.id, title: t.title, days: Math.floor((ctx.now - t.updated) / DAY), text: `"${t.title}" has been in Doing for ${Math.floor((ctx.now - t.updated) / DAY)} days without a change.`, fix: { label: "Back to To do" } });
    else if (t.status === "todo" && ctx.now - t.updated > UNPICKED) out.push({ kind: "unpicked", taskId: t.id, title: t.title, days: Math.floor((ctx.now - t.updated) / DAY), text: `"${t.title}" has waited ${Math.floor((ctx.now - t.updated) / DAY)} days and nobody picked it up.`, fix: { label: "Move to Doing" } });
  }
  if (ctx.running > 0 && !tasks.some((t) => t.status === "doing")) out.push({ kind: "no-card", text: `${ctx.running} thing${ctx.running === 1 ? " is" : "s are"} running and nothing is in Doing.`, fix: { label: "Add a card" } });
  return out;
}

/** The trivial fixes the system may do on a tap. Anything that needs a decision is a button on the card instead. */
export function applyFix(kind: DriftKind, taskId: string): { ok: true } | { error: "not_found" | "bad_kind" } {
  if (kind === "no-card") { addTask({ title: "Work in progress (add a title)", status: "doing" }); return { ok: true }; }
  if (kind === "duplicate") return removeTask(taskId) ? { ok: true } : { error: "not_found" };
  const status = kind === "stale" ? "todo" : kind === "no-evidence" || kind === "unpicked" ? "doing" : null;
  if (!status) return { error: "bad_kind" };
  return "error" in updateTask(taskId, { status }) ? { error: "not_found" } : { ok: true };
}

export function driftApi(app: Hono, isOperator: (c: import("hono").Context) => boolean) {
  app.get("/api/board/drift", (c) => { const tasks = listTasks(), n = running.count(); return c.json({ drift: detectDrift(tasks, { now: Date.now(), running: n }), states: Object.fromEntries(tasks.map((t) => [t.id, stateOf(t, n)])) }); });
  app.post("/api/board/drift/fix", async (c) => {
    if (!isOperator(c)) return c.json({ error: "operator_only" }, 403);
    const b = await c.req.json().catch(() => ({})) as { kind?: unknown; taskId?: unknown }, r = applyFix(String(b.kind) as DriftKind, String(b.taskId ?? ""));
    return "error" in r ? c.json(r, r.error === "not_found" ? 404 : 400) : c.json(r);
  });
}
