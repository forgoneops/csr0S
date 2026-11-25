// One search over what this install holds: notes, library passages, chat messages, board tasks and calendar events.
// Each source answers on its own and a failing one is skipped, so a result list is never empty because of one error.
import type { Context, Hono } from "hono";
import { db } from "./db";
import { notes } from "./notes";
import { search as searchKnowledge } from "./knowledge";

export type Hit = { kind: "note" | "library" | "chat" | "board" | "calendar"; title: string; text: string; ref: string };
const like = (q: string) => `%${q.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
const clip = (s: string, n = 160) => s.replace(/\s+/g, " ").trim().slice(0, n);
const safe = <T>(f: () => T[]): T[] => { try { return f(); } catch { return []; } };

export function searchAll(q: string, limit = 8): Hit[] {
  const t = q.trim(); if (t.length < 2) return [];
  const L = like(t);
  const out: Hit[] = [
    ...safe(() => notes.search(t).slice(0, limit).map((n): Hit => ({ kind: "note", title: n.id, text: clip(n.snippet), ref: n.id }))),
    ...safe(() => searchKnowledge(t, limit).map((h): Hit => ({ kind: "library", title: h.name, text: clip(h.passage), ref: h.docId }))),
    ...safe(() => db.query<{ id: string; title: string; content: string; session_id: string }, [string, number]>(
      "SELECT m.id, s.title, m.content, m.session_id FROM chat_messages m JOIN chat_sessions s ON s.id = m.session_id WHERE m.content LIKE ? ESCAPE '\\' ORDER BY m.created_at DESC LIMIT ?").all(L, limit)
      .map((r): Hit => ({ kind: "chat", title: r.title || "Conversation", text: clip(r.content), ref: r.session_id }))),
    ...safe(() => db.query<{ id: string; title: string; note: string; status: string }, [string, string, number]>(
      "SELECT id, title, note, status FROM board_tasks WHERE title LIKE ? ESCAPE '\\' OR note LIKE ? ESCAPE '\\' LIMIT ?").all(L, L, limit).map((r): Hit => ({ kind: "board", title: r.title, text: clip(r.note || r.status), ref: r.id }))),
    ...safe(() => db.query<{ id: string; title: string; date: string; time: string; note: string }, [string, string, number]>(
      "SELECT id, title, date, time, note FROM cal_events WHERE title LIKE ? ESCAPE '\\' OR note LIKE ? ESCAPE '\\' ORDER BY date LIMIT ?").all(L, L, limit).map((r): Hit => ({ kind: "calendar", title: r.title, text: `${r.date} ${r.time}`.trim(), ref: r.date }))),
  ];
  return out;
}

export const searchApi = (app: Hono, isOperator: (c: Context) => boolean) =>
  app.get("/api/search", (c) => (isOperator(c) ? c.json(searchAll(c.req.query("q") ?? "")) : c.json({ error: "operator_only" }, 403)));
