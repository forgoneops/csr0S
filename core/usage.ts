// Usage: how many answers each engine gave, today and over the last seven days, counted from the chats kept on this
// device. It says nothing about a provider's own limits (those are theirs to show); it is what this install did.
import type { Hono } from "hono";
import { db } from "./db";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { userHome } from "./host";

export type Usage = { engine: string; today: number; week: number; errors: number };

export function usage(now = Date.now()): Usage[] {
  const day = new Date(now); day.setHours(0, 0, 0, 0);
  const start = day.getTime(), weekAgo = start - 6 * 86400000;
  const rows = db.query<{ engine: string; today: number; week: number; errors: number }, [number, number, number]>(
    `SELECT s.engine AS engine,
            SUM(CASE WHEN m.created_at >= ? THEN 1 ELSE 0 END) AS today,
            COUNT(*) AS week,
            SUM(CASE WHEN m.status = 'error' THEN 1 ELSE 0 END) AS errors
       FROM chat_messages m JOIN chat_sessions s ON s.id = m.session_id
      WHERE m.role = 'assistant' AND m.created_at >= ? GROUP BY s.engine ORDER BY week DESC LIMIT ?`).all(start, weekAgo, 50);
  return rows.map((r) => ({ engine: r.engine, today: r.today ?? 0, week: r.week ?? 0, errors: r.errors ?? 0 }));
}

export const usageApi = (app: Hono) => { app.get("/api/usage", (c) => c.json(usage())); app.get("/api/usage/limits", (c) => c.json(toolLimits())); app.get("/api/failures", (c) => c.json(recentFailures())); app.get("/api/toolstats", (c) => c.json(toolStats())); app.get("/api/recent-tools", (c) => c.json(recentTools())); };

/** Answers that failed in the last day, newest first: what "Notifications" shows as problems. */
export function recentFailures(now = Date.now(), limit = 10): { engine: string; at: number; error: string; session: string }[] {
  return db.query<{ engine: string; created_at: number; error: string | null; session_id: string }, [number, number]>(
    `SELECT s.engine AS engine, m.created_at, m.error, m.session_id FROM chat_messages m JOIN chat_sessions s ON s.id = m.session_id
      WHERE m.role = 'assistant' AND m.status = 'error' AND m.created_at >= ? ORDER BY m.created_at DESC LIMIT ?`).all(now - 86400000, limit)
    .map((r) => ({ engine: r.engine, at: r.created_at, error: (r.error ?? "failed").slice(0, 200), session: r.session_id }));
}

export type ToolStat = { name: string; calls: number; errors: number; avgMs: number | null };

/** Tool calls recorded in the replies of the last 30 days, grouped by tool: how often, how many failed, how long on average. */
export function toolStats(now = Date.now()): ToolStat[] {
  const rows = db.query<{ tools: string | null }, [number]>("SELECT tools FROM chat_messages WHERE tools IS NOT NULL AND tools != '' AND created_at >= ?").all(now - 30 * 86400000);
  const by = new Map<string, { calls: number; errors: number; ms: number; timed: number }>();
  for (const r of rows) {
    let list: unknown; try { list = JSON.parse(r.tools ?? "[]"); } catch { continue; }
    if (!Array.isArray(list)) continue;
    for (const t of list as { name?: unknown; status?: unknown; ms?: unknown }[]) {
      if (!t || typeof t.name !== "string") continue;
      const a = by.get(t.name) ?? { calls: 0, errors: 0, ms: 0, timed: 0 }; a.calls++;
      if (t.status === "error") a.errors++;
      if (typeof t.ms === "number") { a.ms += t.ms; a.timed++; }
      by.set(t.name, a);
    }
  }
  return [...by].map(([name, a]) => ({ name, calls: a.calls, errors: a.errors, avgMs: a.timed ? Math.round(a.ms / a.timed) : null })).sort((x, y) => y.calls - x.calls).slice(0, 50);
}

export type RecentTool = { engine: string; name: string; status: string; ms: number | null; at: number };

/** The newest tool calls across conversations, with the engine (the crew member) that made them. */
export function recentTools(limit = 12, now = Date.now()): RecentTool[] {
  const rows = db.query<{ engine: string; tools: string; created_at: number }, [number]>(
    `SELECT s.engine AS engine, m.tools, m.created_at FROM chat_messages m JOIN chat_sessions s ON s.id = m.session_id
      WHERE m.tools IS NOT NULL AND m.tools != '' AND m.tools != '[]' AND m.created_at >= ? ORDER BY m.created_at DESC LIMIT 50`).all(now - 86400000);
  const out: RecentTool[] = [];
  for (const r of rows) {
    let list: unknown; try { list = JSON.parse(r.tools); } catch { continue; }
    if (!Array.isArray(list)) continue;
    for (const t of [...list].reverse() as { name?: unknown; status?: unknown; ms?: unknown }[]) {
      if (t && typeof t.name === "string") out.push({ engine: r.engine, name: t.name, status: typeof t.status === "string" ? t.status : "ok", ms: typeof t.ms === "number" ? t.ms : null, at: r.created_at });
      if (out.length >= limit) return out;
    }
  }
  return out;
}


// ---- the coding tools' own limits (Home and Horde desk): read from the usage records Omarchy keeps for each tool, never estimated ----
export type Window = { percent: number; resetsAt: string; resetInMs: number };
export type ToolLimit = { id: string; name: string; state: "ok" | "stale" | "none"; weekly?: Window; session?: Window; updatedAt?: number };
const TOOLS: [string, string][] = [["codex", "Codex"], ["claude", "Claude Code"], ["hermes", "Hermes"]];
const STALE_MS = 30 * 60_000;

/** One record per tool: "none" when there is no file, no window or the file cannot be read; "stale" when it is old or the tool says so. */
export function toolLimits(opts: { dir?: string; now?: number } = {}): ToolLimit[] {
  const dir = opts.dir ?? process.env.CAESAROS_AGENT_USAGE_DIR ?? join(userHome(), ".local", "state", "omarchy", "agents", "usage"), now = opts.now ?? Date.now();
  return TOOLS.map(([id, name]): ToolLimit => {
    let rec: { limits?: { label?: unknown; percent?: unknown; resetsAt?: unknown }[]; updatedAt?: unknown; limitsFetchedAt?: unknown; limitsStale?: unknown } | null = null;
    try { const f = join(dir, `${id}.json`); rec = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null; } catch { rec = null; }
    const win = (re: RegExp): Window | undefined => {
      const l = (rec?.limits ?? []).find((x) => typeof x?.label === "string" && re.test(x.label)); if (!l || typeof l.percent !== "number" || !Number.isFinite(l.percent)) return undefined;
      const at = typeof l.resetsAt === "string" ? Date.parse(l.resetsAt) : NaN;
      return { percent: Math.min(100, Math.max(0, l.percent)), resetsAt: typeof l.resetsAt === "string" ? l.resetsAt : "", resetInMs: Number.isFinite(at) ? Math.max(0, at - now) : 0 };
    };
    const weekly = win(/week|7.?day/i), session = win(/session|5.?h/i);
    if (!weekly && !session) return { id, name, state: "none" };
    const seen = typeof rec?.updatedAt === "string" ? Date.parse(rec.updatedAt) : typeof rec?.limitsFetchedAt === "number" ? rec.limitsFetchedAt : NaN;
    const stale = rec?.limitsStale === true || !Number.isFinite(seen) || now - seen > STALE_MS;
    return { id, name, state: stale ? "stale" : "ok", ...(weekly ? { weekly } : {}), ...(session ? { session } : {}), ...(Number.isFinite(seen) ? { updatedAt: seen } : {}) };
  });
}
