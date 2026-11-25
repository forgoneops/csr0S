// Projects, first slice: a named place with its own instructions, a default engine and
// model, and the knowledge documents it uses. Chat reads these to start a conversation inside a project;
// nothing here talks to an engine.
import type { Hono } from "hono";
import { db } from "./db";

db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, instructions TEXT NOT NULL DEFAULT '', engine TEXT NOT NULL DEFAULT '', model TEXT NOT NULL DEFAULT '',
    docs TEXT NOT NULL DEFAULT '[]', created INTEGER NOT NULL, updated INTEGER NOT NULL
  );
`);

export type Project = { id: string; name: string; instructions: string; engine: string; model: string; docs: string[]; created: number; updated: number };
type Row = Omit<Project, "docs"> & { docs: string };
const toProject = (r: Row): Project => ({ ...r, docs: JSON.parse(r.docs) as string[] });
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : "");
export const MAX_PROJECTS = 200;

export function listProjects(): Project[] { return db.query<Row, []>("SELECT * FROM projects ORDER BY updated DESC").all().map(toProject); }
export function getProject(id: string): Project | null { const r = db.query<Row, [string]>("SELECT * FROM projects WHERE id = ?").get(id); return r ? toProject(r) : null; }

export function saveProject(input: unknown, id?: string): Project | { error: "name" | "too_many" | "not_found" } {
  const b = (input ?? {}) as Record<string, unknown>;
  const name = clip(b.name, 80).trim();
  const known = new Set(db.query<{ id: string }, []>("SELECT id FROM kb_docs").all().map((d) => d.id));
  const docs = Array.isArray(b.docs) ? [...new Set(b.docs.filter((d): d is string => typeof d === "string" && known.has(d)))].slice(0, 50) : undefined;
  const now = Date.now();
  if (id) {
    const cur = getProject(id); if (!cur) return { error: "not_found" };
    const next = { name: name || cur.name, instructions: b.instructions === undefined ? cur.instructions : clip(b.instructions, 8000), engine: b.engine === undefined ? cur.engine : clip(b.engine, 60), model: b.model === undefined ? cur.model : clip(b.model, 120), docs: docs ?? cur.docs };
    db.query("UPDATE projects SET name=?, instructions=?, engine=?, model=?, docs=?, updated=? WHERE id=?").run(next.name, next.instructions, next.engine, next.model, JSON.stringify(next.docs), now, id);
    return getProject(id)!;
  }
  if (!name) return { error: "name" };
  if (listProjects().length >= MAX_PROJECTS) return { error: "too_many" };
  const nid = crypto.randomUUID();
  db.query("INSERT INTO projects (id, name, instructions, engine, model, docs, created, updated) VALUES (?,?,?,?,?,?,?,?)").run(nid, name, clip(b.instructions, 8000), clip(b.engine, 60), clip(b.model, 120), JSON.stringify(docs ?? []), now, now);
  return getProject(nid)!;
}

export const removeProject = (id: string) => db.query("DELETE FROM projects WHERE id = ?").run(id).changes > 0;

export function projectsApi(app: Hono) {
  app.get("/api/projects", (c) => c.json(listProjects()));
  app.post("/api/projects", async (c) => { const r = saveProject(await c.req.json().catch(() => ({}))); return "error" in r ? c.json(r, 400) : c.json(r, 201); });
  app.put("/api/projects/:id", async (c) => { const r = saveProject(await c.req.json().catch(() => ({})), c.req.param("id")); return "error" in r ? c.json(r, r.error === "not_found" ? 404 : 400) : c.json(r); });
  app.delete("/api/projects/:id", (c) => (removeProject(c.req.param("id")) ? c.json({ ok: true }) : c.json({ error: "not_found" }, 404)));
}
