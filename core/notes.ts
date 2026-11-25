// Notes (core): plain markdown files in DATA/notes, one file per note, so any editor or Obsidian can open them.
// The note's name is its file name. Writes are atomic and carry the revision they were based on, so two windows
// (or the phone and the desktop) never silently overwrite each other. Delete moves to .trash, it never destroys.
// Operator only: an agent token cannot read or touch notes (the owner's notes are not an agent's to edit).
// Folders: a note id may carry folders ("Sessions/2026-11-20-bridge"), so an Obsidian vault opens as it is. Tags and links are read by
// scanning every note on request (fine to a few thousand). shortcut: no trash restore UI.
import { layout } from "./graphlayout";
import { treeLayout, type Branch } from "./arbor";
import type { Hono } from "hono";
import { createHash } from "node:crypto";
import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DATA } from "./db";
import { access } from "./principal";

export const MAX_NOTE_BYTES = 1024 * 1024;
export const MAX_NOTES = 5000;
const NAME = /^[\p{L}\p{N}][\p{L}\p{N} _.()-]{0,79}$/u;     // one path segment
export const MAX_DEPTH = 6;
export const MAP_MAX = 600;

export type NoteMeta = { id: string; updatedAt: number; size: number; snippet: string };
export type Note = { id: string; content: string; rev: string; updatedAt: number };

export const revOf = (content: string): string => createHash("sha1").update(content).digest("hex").slice(0, 16);
/** A valid id: one to six segments joined by "/", each made of letters, digits, spaces and _.()- and starting with a letter or digit; no "..", no empty segment. */
export const validName = (s: unknown): s is string => {
  if (typeof s !== "string" || s !== s.trim() || s.length > 240 || s.includes("..")) return false;
  const parts = s.split("/");
  return parts.length <= MAX_DEPTH && parts.every((p) => NAME.test(p) && p === p.trim());
};

export function createNotes(dir: string = join(DATA, "notes")) {
  mkdirSync(join(dir, ".trash"), { recursive: true });
  const file = (id: string) => join(dir, ...id.split("/")) + ".md";
  /** A regular file only: a symlink placed in the folder is ignored, never followed. */
  const regular = (p: string) => { try { const st = lstatSync(p); return st.isFile() && !st.isSymbolicLink() ? st : null; } catch { return null; } };
  /** The first 512 bytes only: listing thousands of notes must not read them whole. */
  const headOf = (p: string): string => {
    const fd = openSync(p, "r");
    try { const buf = Buffer.alloc(512); const n = readSync(fd, buf, 0, 512, 0); return buf.subarray(0, n).toString("utf8"); } finally { closeSync(fd); }
  };
  const snippetOf = (text: string) => text.replace(/\s+/g, " ").trim().slice(0, 140);

  const readRaw = (id: string): { content: string; updatedAt: number } | null => {
    const st = regular(file(id));
    if (!st || st.size > MAX_NOTE_BYTES) return null;
    return { content: readFileSync(file(id), "utf8"), updatedAt: Math.round(st.mtimeMs) };
  };

  function list(): NoteMeta[] {
    const out: NoteMeta[] = [];
    const walk = (sub: string[], depth: number) => {
      if (out.length >= MAX_NOTES || depth > MAX_DEPTH) return;
      let entries; try { entries = readdirSync(join(dir, ...sub), { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        if (out.length >= MAX_NOTES) return;
        if (e.name.startsWith(".")) continue;                       // .obsidian, .trash, temp files
        if (e.isDirectory()) { walk([...sub, e.name], depth + 1); continue; }
        if (!e.name.endsWith(".md")) continue;
        const id = [...sub, e.name.slice(0, -3)].join("/");
        const st = regular(file(id));
        if (!st || !validName(id)) continue;
        out.push({ id, updatedAt: Math.round(st.mtimeMs), size: st.size, snippet: snippetOf(headOf(file(id))) });
      }
    };
    walk([], 1);
    return out.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  function search(q: string): NoteMeta[] {
    const needle = q.trim().toLowerCase();
    if (needle.length < 2) return [];
    const hits: NoteMeta[] = [];
    for (const m of list()) {
      const raw = readRaw(m.id);
      const hay = raw?.content ?? "";
      const at = hay.toLowerCase().indexOf(needle);
      if (m.id.toLowerCase().includes(needle) || at >= 0) {
        hits.push({ ...m, snippet: at >= 0 ? snippetOf(hay.slice(Math.max(0, at - 50), at + 90)) : m.snippet });
        if (hits.length >= 50) break;
      }
    }
    return hits;
  }

  function get(id: string): Note | null {
    if (!validName(id)) return null;
    const raw = readRaw(id);
    return raw ? { id, content: raw.content, rev: revOf(raw.content), updatedAt: raw.updatedAt } : null;
  }

  const atomicWrite = (id: string, content: string) => {
    mkdirSync(dirname(file(id)), { recursive: true });
    const tmp = join(dirname(file(id)), `.${id.split("/").pop()}.${process.pid}.tmp`);
    writeFileSync(tmp, content, "utf8");
    renameSync(tmp, file(id));
  };

  type Fail = { error: "invalid_name" | "too_large" | "exists" | "not_found" | "conflict" | "too_many"; current?: Note };

  function create(name: unknown, content: unknown): { note: Note } | Fail {
    const text = typeof content === "string" ? content : "";
    if (Buffer.byteLength(text) > MAX_NOTE_BYTES) return { error: "too_large" };
    let id: string;
    if (name === undefined || name === null || name === "") {
      id = "Untitled";
      for (let n = 2; existsSync(file(id)); n++) id = `Untitled ${n}`;
    } else if (!validName(name)) return { error: "invalid_name" };
    else id = name;
    if (list().length >= MAX_NOTES) return { error: "too_many" };
    if (existsSync(file(id))) return { error: "exists" };
    atomicWrite(id, text);
    return { note: get(id)! };
  }

  /** Save content (and optionally rename) only if the note is still at the revision the caller saw. */
  function update(id: string, input: { content?: unknown; rev?: unknown; name?: unknown }): { note: Note } | Fail {
    if (!validName(id)) return { error: "invalid_name" };
    const cur = get(id);
    if (!cur) return { error: "not_found" };
    if (typeof input.rev !== "string" || input.rev !== cur.rev) return { error: "conflict", current: cur };
    const text = typeof input.content === "string" ? input.content : cur.content;
    if (Buffer.byteLength(text) > MAX_NOTE_BYTES) return { error: "too_large" };
    let target = id;
    if (input.name !== undefined && input.name !== id) {
      if (!validName(input.name)) return { error: "invalid_name" };
      if (existsSync(file(input.name))) return { error: "exists" };
      target = input.name;
    }
    atomicWrite(id, text);
    if (target !== id) { mkdirSync(dirname(file(target)), { recursive: true }); renameSync(file(id), file(target)); }
    return { note: get(target)! };
  }

  function trash(id: string): { ok: true } | Fail {
    if (!validName(id)) return { error: "invalid_name" };
    if (!regular(file(id))) return { error: "not_found" };
    renameSync(file(id), join(dir, ".trash", `${id.replaceAll("/", "__")}.${Date.now()}.md`));
    return { ok: true };
  }

  /** Obsidian-style: #tag in the text (not "# heading") and [[Title]] or [[Title|alias]] links. Reads every note once. */
  function scan(): { id: string; tags: string[]; links: string[] }[] {
    const out: { id: string; tags: string[]; links: string[] }[] = [];
    for (const m of list()) {
      const raw = readRaw(m.id); if (!raw) continue;
      const tags = [...new Set([...raw.content.matchAll(/(?:^|\s)#([\p{L}\p{N}_][\p{L}\p{N}_/-]*)/gu)].map((x) => x[1]!.toLowerCase()))];
      const links = [...new Set([...raw.content.matchAll(/\[\[([^\]|#\n]+)(?:[|#][^\]\n]*)?\]\]/g)].map((x) => x[1]!.trim()))];
      out.push({ id: m.id, tags, links });
    }
    return out;
  }
  function tags(): { tag: string; count: number }[] {
    const c = new Map<string, number>();
    for (const n of scan()) for (const t of n.tags) c.set(t, (c.get(t) ?? 0) + 1);
    return [...c].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  }
  const withTag = (tag: string): NoteMeta[] => { const ids = new Set(scan().filter((n) => n.tags.includes(tag.toLowerCase())).map((n) => n.id)); return list().filter((m) => ids.has(m.id)); };
  /** A link may name the whole id or only the file name (Obsidian resolves [[Garden]] to Plants/Garden). */
  const backlinks = (id: string): string[] => { const full = id.toLowerCase(), base = (id.split("/").pop() ?? id).toLowerCase(); return scan().filter((n) => n.id !== id && n.links.some((l) => { const x = l.toLowerCase(); return x === full || x === base || x.split("/").pop() === base; })).map((n) => n.id); };

  /** The map: notes are nodes, a real [[link]] is an edge (resolved like backlinks); nothing is drawn from similarity. At most MAP_MAX nodes, the best linked. */
  function graph(): { nodes: { id: string; title: string; folder: string; degree: number; updated: number; x: number; y: number }[]; edges: { from: string; to: string }[]; tree: { nodes: Record<string, [number, number]>; branches: Branch[] }; total: number; truncated: boolean } {
    const all = scan(), when = new Map(list().map((m) => [m.id, m.updatedAt])), byFull = new Map(all.map((n) => [n.id.toLowerCase(), n.id])), byBase = new Map<string, string>();
    for (const n of all) { const b = (n.id.split("/").pop() ?? n.id).toLowerCase(); if (!byBase.has(b)) byBase.set(b, n.id); }
    const seen = new Set<string>(), edges: { from: string; to: string }[] = [];
    for (const n of all) for (const l of n.links) {
      const x = l.toLowerCase(), to = byFull.get(x) ?? byBase.get(x.split("/").pop() ?? x); if (!to || to === n.id) continue;
      const k = n.id + "\0" + to; if (!seen.has(k)) { seen.add(k); edges.push({ from: n.id, to }); }
    }
    const deg = new Map<string, number>(); for (const e of edges) { deg.set(e.from, (deg.get(e.from) ?? 0) + 1); deg.set(e.to, (deg.get(e.to) ?? 0) + 1); }
    const keep = [...all].sort((a, b) => (deg.get(b.id) ?? 0) - (deg.get(a.id) ?? 0) || a.id.localeCompare(b.id)).slice(0, MAP_MAX).map((n) => n.id), ids = new Set(keep);
    const e2 = edges.filter((e) => ids.has(e.from) && ids.has(e.to)), pos = layout(keep, e2);
    const nodes = keep.map((id) => ({ id, title: id.split("/").pop() ?? id, folder: id.includes("/") ? id.split("/")[0]! : "", degree: deg.get(id) ?? 0, updated: when.get(id) ?? 0, x: Math.round(pos.get(id)!.x), y: Math.round(pos.get(id)!.y) }));
    return { nodes, edges: e2, tree: treeLayout(nodes), total: all.length, truncated: all.length > keep.length };
  }

  return { list, search, get, create, update, trash, tags, withTag, backlinks, graph };
}

export const notes = createNotes();

const STATUS: Record<string, 400 | 404 | 409 | 413> = { invalid_name: 400, too_many: 400, exists: 409, not_found: 404, conflict: 409, too_large: 413 };

export function noteRoutes(app: Hono, store = notes): void {
  // The owner's notes are the operator's own: an agent token or an anonymous caller is refused before anything is read.
  app.use("/api/notes/*", async (c, next) => (access.principal(c).kind === "operator" ? next() : c.json({ error: "operator_only" }, 403)));
  app.use("/api/notes", async (c, next) => (access.principal(c).kind === "operator" ? next() : c.json({ error: "operator_only" }, 403)));

  app.get("/api/notes", (c) => c.json(c.req.query("tag") ? store.withTag(c.req.query("tag")!) : c.req.query("q") ? store.search(c.req.query("q")!) : store.list()));
  app.get("/api/notes/graph", (c) => c.json(store.graph()));
  app.get("/api/notes/tags", (c) => c.json(store.tags()));
  app.get("/api/notes/:id/backlinks", (c) => c.json(store.backlinks(c.req.param("id"))));

  app.post("/api/notes", async (c) => {
    const b = await c.req.json().catch(() => ({})) as { name?: unknown; content?: unknown };
    const r = store.create(b.name, b.content);
    return "error" in r ? c.json({ error: r.error }, STATUS[r.error]) : c.json(r.note, 201);
  });

  app.get("/api/notes/:id", (c) => { const n = store.get(c.req.param("id")); return n ? c.json(n) : c.json({ error: "not_found" }, 404); });

  app.put("/api/notes/:id", async (c) => {
    const b = await c.req.json().catch(() => ({})) as { content?: unknown; rev?: unknown; name?: unknown };
    const r = store.update(c.req.param("id"), b);
    if ("error" in r) return c.json({ error: r.error, current: r.current }, STATUS[r.error]);
    return c.json(r.note);
  });

  app.delete("/api/notes/:id", (c) => {
    const r = store.trash(c.req.param("id"));
    return "error" in r ? c.json({ error: r.error }, STATUS[r.error]) : c.json({ ok: true });
  });
}
