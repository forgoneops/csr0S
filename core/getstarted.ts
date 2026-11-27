// Get started: six first steps whose ticks come from what this core really holds. Nothing is ticked by clicking.
import type { Context, Hono } from "hono";
import { db, kv } from "./db";
import { listEngines } from "./engines";
import { notes } from "./notes";
import { pairedCount } from "./pairing";
import { listBackups } from "./backup";

export const STEP_IDS = ["engine", "model", "chat", "note", "device", "backup"] as const;
export type StepId = (typeof STEP_IDS)[number];
/** How many of each thing exist; null means it could not be checked. */
export type Facts = Record<StepId, number | null>;

/** done: true or false from the count, null when unknown. An unknown step never counts as done. */
export function tickSteps(facts: Facts) {
  const steps = STEP_IDS.map((id) => ({ id, done: facts[id] === null ? null : facts[id]! > 0 }));
  const done = steps.filter((s) => s.done === true).length;
  return { steps, done, total: steps.length, allDone: done === steps.length };
}

const count = (fn: () => number): number | null => { try { return fn(); } catch { return null; } };

export async function readFacts(): Promise<Facts> {
  let engine: number | null = null, model: number | null = null;
  try {
    const probed = await Promise.all(listEngines().map(async (e) => {
      const ok = await e.health().then((h) => h.ok, () => false);
      return { ok, models: ok ? await e.models().then((m) => m.length, () => null) : 0 };
    }));
    engine = probed.filter((p) => p.ok).length;
    const found = probed.reduce((n, p) => n + (p.models ?? 0), 0);
    model = !found && probed.some((p) => p.models === null) ? null : found;   // a failed model list is unknown, not "none"
  } catch { /* both stay unknown */ }
  return {
    engine, model,
    chat: count(() => (db.query("SELECT EXISTS (SELECT 1 FROM chat_messages WHERE role = 'user') AS n").get() as { n: number }).n),
    note: count(() => notes.list().length),
    device: count(pairedCount),
    backup: count(() => listBackups().length),
  };
}

export function getStartedApi(app: Hono, isOperator: (c: Context) => boolean) {
  const store = kv("get-started");
  app.get("/api/get-started", async (c) => c.json({ ...tickSteps(await readFacts()), dismissed: store.get("dismissed", false) }));
  app.put("/api/get-started", async (c) => {
    if (!isOperator(c)) return c.json({ error: "operator_only" }, 403);
    const b = await c.req.json().catch(() => ({})) as { dismissed?: unknown };
    if (typeof b.dismissed !== "boolean") return c.json({ error: "dismissed must be true or false" }, 400);
    store.set("dismissed", b.dismissed);
    return c.json({ dismissed: b.dismissed });
  });
}
