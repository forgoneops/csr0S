// Calendar: events on a date, kept in this install's database. Local only; an outside calendar would be a connector.
import type { Hono } from "hono";
import { db } from "./db";

db.exec(`CREATE TABLE IF NOT EXISTS cal_events (id TEXT PRIMARY KEY, title TEXT NOT NULL, date TEXT NOT NULL, time TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', created INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS cal_date ON cal_events (date);`);

export type Event = { id: string; title: string; date: string; time: string; note: string; created: number };
export const MAX_EVENTS = 5000;
const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
export const validDate = (s: unknown): s is string => typeof s === "string" && DATE.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z")) && new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s;

export function listEvents(from?: string, to?: string): Event[] {
  if (validDate(from) && validDate(to)) return db.query<Event, [string, string]>("SELECT * FROM cal_events WHERE date >= ? AND date <= ? ORDER BY date, time, created").all(from, to);
  return db.query<Event, []>("SELECT * FROM cal_events ORDER BY date, time, created").all();
}

export function addEvent(i: { title?: unknown; date?: unknown; time?: unknown; note?: unknown }): Event | { error: "title" | "date" | "time" | "too_many" } {
  const title = typeof i.title === "string" ? i.title.trim().slice(0, 200) : "";
  if (!title) return { error: "title" };
  if (!validDate(i.date)) return { error: "date" };
  const time = i.time === undefined || i.time === "" ? "" : typeof i.time === "string" && TIME.test(i.time) ? i.time : null;
  if (time === null) return { error: "time" };
  if (db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM cal_events").get()!.n >= MAX_EVENTS) return { error: "too_many" };
  const id = crypto.randomUUID();
  db.query("INSERT INTO cal_events (id, title, date, time, note, created) VALUES (?,?,?,?,?,?)").run(id, title, i.date, time, typeof i.note === "string" ? i.note.slice(0, 2000) : "", Date.now());
  return db.query<Event, [string]>("SELECT * FROM cal_events WHERE id = ?").get(id)!;
}

export const removeEvent = (id: string) => db.query("DELETE FROM cal_events WHERE id = ?").run(id).changes > 0;

export function calendarApi(app: Hono) {
  app.get("/api/calendar", (c) => c.json(listEvents(c.req.query("from"), c.req.query("to"))));
  app.post("/api/calendar", async (c) => { const r = addEvent(await c.req.json().catch(() => ({}))); return "error" in r ? c.json(r, 400) : c.json(r, 201); });
  app.delete("/api/calendar/:id", (c) => (removeEvent(c.req.param("id")) ? c.json({ ok: true }) : c.json({ error: "not_found" }, 404)));
}

/** An event from a paired device, kept under its own id (so a repeated push changes nothing). Edits do not exist; deletions are not synced. */
export function importEvent(e: Partial<Event>): "created" | "same" | "refused" {
  if (typeof e.id !== "string" || !/^[0-9a-f-]{36}$/.test(e.id) || typeof e.title !== "string" || !e.title.trim() || !validDate(e.date)) return "refused";
  const time = e.time === undefined || e.time === "" ? "" : typeof e.time === "string" && TIME.test(e.time) ? e.time : null;
  if (time === null) return "refused";
  if (db.query("SELECT 1 FROM cal_events WHERE id = ?").get(e.id)) return "same";
  if (db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM cal_events").get()!.n >= MAX_EVENTS) return "refused";
  db.query("INSERT INTO cal_events (id, title, date, time, note, created) VALUES (?,?,?,?,?,?)").run(e.id, e.title.trim().slice(0, 200), e.date, time, typeof e.note === "string" ? e.note.slice(0, 2000) : "", typeof e.created === "number" ? e.created : Date.now());
  return "created";
}
