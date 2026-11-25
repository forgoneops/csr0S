// Plain lists that need nothing but a checkbox: goals, ideas, reading (and the clipboard shelf, where "done" is unused). One table, a fixed set of names, so a made-up
// list name cannot create data. Anything bigger (a real planner, a reader) is its own module later.
import type { Hono } from "hono";
import { db } from "./db";

db.exec(`CREATE TABLE IF NOT EXISTS list_items (id TEXT PRIMARY KEY, list TEXT NOT NULL, text TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS list_items_list ON list_items (list, created);`);

export const LISTS = ["goals", "ideas", "reading", "clipboard", "watchers", "missions", "prompts", "evidence", "leads", "offers", "builds", "business", "designs", "reels", "feeds"] as const;
export type ListName = (typeof LISTS)[number];
export type Item = { id: string; list: ListName; text: string; done: boolean; created: number };
export const MAX_ITEMS = 1000;
export const isList = (v: unknown): v is ListName => typeof v === "string" && (LISTS as readonly string[]).includes(v);
const row = (r: { id: string; list: ListName; text: string; done: number; created: number }): Item => ({ ...r, done: !!r.done });

export const listItems = (list: ListName): Item[] => db.query<{ id: string; list: ListName; text: string; done: number; created: number }, [string]>("SELECT * FROM list_items WHERE list = ? ORDER BY done ASC, created DESC").all(list).map(row);

export function addItem(list: ListName, text: unknown): Item | { error: "text" | "too_many" } {
  const t = typeof text === "string" ? text.trim().slice(0, 300) : "";
  if (!t) return { error: "text" };
  if (db.query<{ n: number }, [string]>("SELECT COUNT(*) AS n FROM list_items WHERE list = ?").get(list)!.n >= MAX_ITEMS) return { error: "too_many" };
  const id = crypto.randomUUID(), created = Date.now();
  db.query("INSERT INTO list_items (id, list, text, done, created) VALUES (?,?,?,0,?)").run(id, list, t, created);
  return { id, list, text: t, done: false, created };
}

export const setDone = (id: string, done: boolean): boolean => db.query("UPDATE list_items SET done = ? WHERE id = ?").run(done ? 1 : 0, id).changes > 0;
export const removeItem = (id: string): boolean => db.query("DELETE FROM list_items WHERE id = ?").run(id).changes > 0;

export function listsApi(app: Hono) {
  app.get("/api/lists/:name", (c) => (isList(c.req.param("name")) ? c.json(listItems(c.req.param("name") as ListName)) : c.json({ error: "unknown_list" }, 404)));
  app.post("/api/lists/:name", async (c) => {
    if (!isList(c.req.param("name"))) return c.json({ error: "unknown_list" }, 404);
    const b = await c.req.json().catch(() => ({})) as { text?: unknown };
    const r = addItem(c.req.param("name") as ListName, b.text); return "error" in r ? c.json(r, 400) : c.json(r, 201);
  });
  app.put("/api/lists/item/:id", async (c) => { const b = await c.req.json().catch(() => ({})) as { done?: unknown }; return typeof b.done === "boolean" && setDone(c.req.param("id"), b.done) ? c.json({ ok: true }) : c.json({ error: "not_found" }, 404); });
  app.delete("/api/lists/item/:id", (c) => (removeItem(c.req.param("id")) ? c.json({ ok: true }) : c.json({ error: "not_found" }, 404)));
}
