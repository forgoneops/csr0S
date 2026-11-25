// What is running right now, so one button can stop it all (the "Stop everything" of the live bar).
// A running thing registers a stop function and removes it when it ends. Nothing here starts anything.
import type { Hono } from "hono";

const stops = new Map<string, () => void>();
export const running = {
  add(id: string, stop: () => void) { stops.set(id, stop); },
  remove(id: string) { stops.delete(id); },
  count: () => stops.size,
  /** Stops every registered job; returns how many were running. One that throws does not keep the others alive. */
  stopAll(): number { const n = stops.size; for (const [id, stop] of [...stops]) { try { stop(); } catch { /* already gone */ } stops.delete(id); } return n; },
};

export function runningApi(app: Hono, isOperator: (c: import("hono").Context) => boolean) {
  app.get("/api/running", (c) => c.json({ count: running.count() }));
  app.post("/api/running/stop", (c) => (isOperator(c) ? c.json({ stopped: running.stopAll() }) : c.json({ error: "operator_only" }, 403)));
}
