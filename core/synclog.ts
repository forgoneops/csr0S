// The change feed: an append-only log of what sync sent, applied or held. Names and outcomes only, never contents.
import type { Context, Hono } from "hono";
import { kv } from "./db";

export type Line = { seq: number; at: number; dir: "in" | "out"; device: string; type: string; name: string; outcome: string };
const store = kv("synclog");
const CAP = 500;
export const feed = (after = 0): Line[] => store.get<Line[]>("lines", []).filter((l) => l.seq > after);
export function logLine(l: Omit<Line, "seq" | "at">, at = Date.now()): Line {
  const all = store.get<Line[]>("lines", []), seq = (all[all.length - 1]?.seq ?? 0) + 1, line: Line = { seq, at, ...l, name: String(l.name).slice(0, 100), device: String(l.device).slice(0, 60) };
  store.set("lines", [...all, line].slice(-CAP));
  return line;
}
export const feedApi = (app: Hono, isOperator: (c: Context) => boolean) =>
  app.get("/api/sync/feed", (c) => (isOperator(c) ? c.json(feed(Number(c.req.query("after")) || 0).slice(-200)) : c.json({ error: "operator_only" }, 403)));
