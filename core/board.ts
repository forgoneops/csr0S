import { parseDag, briefOf } from "./dag";
// Board: tasks in three columns (Todo, Doing, Done), kept in this install's database. A plain local list; the crew's
// Board on a server is an owner-layer module that can read and write through these same routes later.
import type { Hono } from "hono";
import { db } from "./db";

db.exec(`CREATE TABLE IF NOT EXISTS board_tasks (id TEXT PRIMARY KEY, title TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', status TEXT NOT NULL, pos INTEGER NOT NULL, created INTEGER NOT NULL, updated INTEGER NOT NULL);`);

if (!db.query<{ name: string }, []>("PRAGMA table_info(board_tasks)").all().some((c) => c.name === "evidence")) db.exec("ALTER TABLE board_tasks ADD COLUMN evidence TEXT NOT NULL DEFAULT ''");

if (!db.query<{ name: string }, []>("PRAGMA table_info(board_tasks)").all().some((c) => c.name === "by")) db.exec("ALTER TABLE board_tasks ADD COLUMN by TEXT NOT NULL DEFAULT ''");   // '' = the owner's own card

if (!db.query<{ name: string }, []>("PRAGMA table_info(board_tasks)").all().some((c) => c.name === "after")) db.exec("ALTER TABLE board_tasks ADD COLUMN after TEXT NOT NULL DEFAULT ''");   // card ids this one waits for, comma separated

export const STATUSES = ["todo", "doing", "done"] as const;
export type Status = (typeof STATUSES)[number];
export type Task = { id: string; title: string; note: string; status: Status; pos: number; created: number; updated: number; evidence: string; by: string; after: string };
export const MAX_TASKS = 500;

export const listTasks = (): Task[] => db.query<Task, []>("SELECT * FROM board_tasks ORDER BY pos ASC, created ASC").all();
const isStatus = (v: unknown): v is Status => typeof v === "string" && (STATUSES as readonly string[]).includes(v);

export function addTask(input: { title?: unknown; note?: unknown; status?: unknown; evidence?: unknown }): Task | { error: "title" | "too_many" } {
  const title = typeof input.title === "string" ? input.title.trim().slice(0, 200) : "";
  if (!title) return { error: "title" };
  if (listTasks().length >= MAX_TASKS) return { error: "too_many" };
  const status: Status = isStatus(input.status) ? input.status : "todo";
  const now = Date.now(), id = crypto.randomUUID();
  const pos = (db.query<{ m: number | null }, [string]>("SELECT MAX(pos) AS m FROM board_tasks WHERE status = ?").get(status)?.m ?? -1) + 1;
  db.query("INSERT INTO board_tasks (id, title, note, status, pos, created, updated, evidence) VALUES (?,?,?,?,?,?,?,?)").run(id, title, typeof input.note === "string" ? input.note.slice(0, 4000) : "", status, pos, now, now, typeof input.evidence === "string" ? input.evidence.slice(0, 1000) : "");
  return db.query<Task, [string]>("SELECT * FROM board_tasks WHERE id = ?").get(id)!;
}

export function updateTask(id: string, input: { title?: unknown; note?: unknown; status?: unknown; evidence?: unknown }): Task | { error: "not_found" | "title" } {
  const cur = db.query<Task, [string]>("SELECT * FROM board_tasks WHERE id = ?").get(id);
  if (!cur) return { error: "not_found" };
  const title = input.title === undefined ? cur.title : typeof input.title === "string" ? input.title.trim().slice(0, 200) : "";
  if (!title) return { error: "title" };
  const status = isStatus(input.status) ? input.status : cur.status;
  const pos = status === cur.status ? cur.pos : (db.query<{ m: number | null }, [string]>("SELECT MAX(pos) AS m FROM board_tasks WHERE status = ?").get(status)?.m ?? -1) + 1;
  db.query("UPDATE board_tasks SET title=?, note=?, status=?, pos=?, updated=?, evidence=? WHERE id=?").run(title, typeof input.note === "string" ? input.note.slice(0, 4000) : cur.note, status, pos, Date.now(), typeof input.evidence === "string" ? input.evidence.slice(0, 1000) : cur.evidence, id);
  return db.query<Task, [string]>("SELECT * FROM board_tasks WHERE id = ?").get(id)!;
}

export const removeTask = (id: string) => db.query("DELETE FROM board_tasks WHERE id = ?").run(id).changes > 0;

/** A card made by an agent through the layer: it carries the agent's name and can be changed only by that agent (the owner changes anything).
 *  An agent may not delete, and may not close a card without evidence. */
const agentName = (v: unknown) => (typeof v === "string" && /^[a-z0-9][a-z0-9_-]{0,39}$/.test(v) ? v : "agent");
export function agentAdd(input: Record<string, unknown>): Task | { error: "title" | "too_many" } {
  const by = agentName(input.agent), status = input.status === "doing" ? "doing" : "todo";
  const r = addTask({ title: input.title, note: input.note, status });
  if ("error" in r) return r;
  db.query("UPDATE board_tasks SET by = ? WHERE id = ?").run(by, r.id);
  return { ...r, by };
}
/** Whole plan at once or not at all: every node becomes a card carrying its brief and the ids of the cards it waits for. */
export function agentDag(input: Record<string, unknown>): { cards: Task[] } | { error: string } {
  const p = parseDag(input.nodes); if ("error" in p) return p;
  if (listTasks().length + p.nodes.length > MAX_TASKS) return { error: "the board is full" };
  const by = agentName(input.agent), ids = new Map<string, string>(), cards: Task[] = [];
  const left = [...p.nodes];
  while (left.length) {                                         // parents first, so a card can name the ids it waits for
    const i = left.findIndex((n) => n.after.every((a) => ids.has(a))), n = left.splice(i, 1)[0];
    const r = addTask({ title: n.task, note: briefOf(n), status: "todo" }) as Task;
    ids.set(n.key, r.id);
    const after = n.after.map((a) => ids.get(a)!).join(",");
    db.query("UPDATE board_tasks SET by = ?, after = ? WHERE id = ?").run(by, after, r.id);
    cards.push({ ...r, by, after });
  }
  return { cards };
}
export function agentUpdate(id: string, input: Record<string, unknown>): Task | { error: "not_found" | "not_yours" | "needs_evidence" } {
  const cur = db.query<Task, [string]>("SELECT * FROM board_tasks WHERE id = ?").get(id);
  if (!cur) return { error: "not_found" };
  if (!cur.by || cur.by !== agentName(input.agent)) return { error: "not_yours" };
  const evidence = typeof input.evidence === "string" ? input.evidence.trim() : cur.evidence;
  if (input.status === "done" && evidence.length < 4) return { error: "needs_evidence" };
  const r = updateTask(id, { status: input.status, note: input.note, evidence });
  return "error" in r ? { error: "not_found" } : r;
}

export function boardApi(app: Hono, agent: (c: import("hono").Context) => boolean = () => false, audit: (who: string, claim: string, id: string) => void = () => {}) {
  const gate = (c: import("hono").Context) => (agent(c) ? null : c.json({ error: "a board token is needed" }, 403));
  app.get("/api/board/agent", (c) => gate(c) ?? c.json(listTasks().filter((t) => t.status !== "done").slice(0, 100)));
  app.post("/api/board/agent", async (c) => {
    const g = gate(c); if (g) return g;
    const b = await c.req.json().catch(() => ({})), r = agentAdd(b);
    if ("error" in r) return c.json(r, 400);
    audit(r.by, `added card "${r.title.slice(0, 80)}"`, r.id); return c.json(r, 201);
  });
  app.post("/api/board/agent/dag", async (c) => {
    const g = gate(c); if (g) return g;
    const r = agentDag(await c.req.json().catch(() => ({})));
    if ("error" in r) return c.json(r, 400);
    audit(r.cards[0].by, `added a plan of ${r.cards.length} cards`, r.cards[0].id); return c.json(r, 201);
  });
  app.put("/api/board/agent/:id", async (c) => {
    const g = gate(c); if (g) return g;
    const b = await c.req.json().catch(() => ({})), r = agentUpdate(c.req.param("id"), b);
    if ("error" in r) return c.json(r, r.error === "not_found" ? 404 : r.error === "not_yours" ? 403 : 400);
    audit(r.by, `card moved to ${r.status}`, r.id); return c.json(r);
  });
  app.get("/api/board", (c) => c.json(listTasks()));
  app.post("/api/board", async (c) => { const r = addTask(await c.req.json().catch(() => ({}))); return "error" in r ? c.json(r, 400) : c.json(r, 201); });
  app.put("/api/board/:id", async (c) => { const r = updateTask(c.req.param("id"), await c.req.json().catch(() => ({}))); return "error" in r ? c.json(r, r.error === "not_found" ? 404 : 400) : c.json(r); });
  app.delete("/api/board/:id", (c) => (removeTask(c.req.param("id")) ? c.json({ ok: true }) : c.json({ error: "not_found" }, 404)));
}

/** A task that came from a paired device: kept under its own id so repeated pushes never duplicate it; a newer edit wins. */
export function importTask(t: Partial<Task>): "created" | "updated" | "same" | "refused" {
  if (typeof t.id !== "string" || !/^[0-9a-f-]{36}$/.test(t.id) || typeof t.title !== "string" || !t.title.trim() || !isStatus(t.status)) return "refused";
  const updated = typeof t.updated === "number" ? t.updated : Date.now();
  const cur = db.query<Task, [string]>("SELECT * FROM board_tasks WHERE id = ?").get(t.id);
  const title = t.title.trim().slice(0, 200), note = typeof t.note === "string" ? t.note.slice(0, 4000) : "", evidence = typeof t.evidence === "string" ? t.evidence.slice(0, 1000) : "";
  if (!cur) {
    if (listTasks().length >= MAX_TASKS) return "refused";
    const pos = (db.query<{ m: number | null }, [string]>("SELECT MAX(pos) AS m FROM board_tasks WHERE status = ?").get(t.status)?.m ?? -1) + 1;
    db.query("INSERT INTO board_tasks (id, title, note, status, pos, created, updated, evidence) VALUES (?,?,?,?,?,?,?,?)").run(t.id, title, note, t.status, pos, typeof t.created === "number" ? t.created : updated, updated, evidence);
    return "created";
  }
  if (cur.title === title && cur.note === note && cur.status === t.status && cur.evidence === evidence) return "same";
  if (updated <= cur.updated) return "same";
  db.query("UPDATE board_tasks SET title=?, note=?, status=?, updated=?, evidence=? WHERE id=?").run(title, note, t.status, updated, evidence, t.id);
  return "updated";
}
