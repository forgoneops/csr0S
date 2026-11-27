// Knowledge base, first slice: documents the person adds as text, split into
// passages, searched with SQLite's own full-text index. No embeddings and nothing leaves the machine.
// shortcut: keyword search only (FTS5), add local embeddings when a local engine ships.
import type { Hono } from "hono";
import { db } from "./db";

// The first draft of the index had no folded column; it was never shipped, so it is rebuilt empty.
if (db.query("SELECT 1 FROM sqlite_master WHERE name = 'kb_fts'").get() && !db.query("SELECT 1 FROM pragma_table_info('kb_fts') WHERE name = 'folded'").get()) db.exec("DROP TABLE kb_fts; DELETE FROM kb_docs");
db.exec(`
  CREATE TABLE IF NOT EXISTS kb_docs (id TEXT PRIMARY KEY, name TEXT NOT NULL, chars INTEGER NOT NULL, added INTEGER NOT NULL);
  CREATE VIRTUAL TABLE IF NOT EXISTS kb_fts USING fts5(doc_id UNINDEXED, passage UNINDEXED, folded, tokenize = 'unicode61 remove_diacritics 2');
`);

/** unicode61 folds accents but not the Polish l-stroke, so fold it ourselves: "lodz" finds "Łódź". */
const fold = (t: string) => t.toLowerCase().replace(/ł/g, "l");

// Folders are one optional name per document (added later, so an older database gets the column here).
if (!db.query("SELECT 1 FROM pragma_table_info('kb_docs') WHERE name = 'folder'").get()) db.exec("ALTER TABLE kb_docs ADD COLUMN folder TEXT NOT NULL DEFAULT ''");

export const MAX_CHARS = 2_000_000;

/** Passages of about 800 characters, cut at paragraph or sentence ends where one is near. */
export function split(text: string, size = 800): string[] {
  const out: string[] = [];
  let rest = text.replace(/\r\n/g, "\n").trim();
  while (rest.length > size) {
    let cut = rest.lastIndexOf("\n\n", size);
    if (cut < size / 2) cut = rest.lastIndexOf(". ", size) + 1;
    if (cut < size / 2) cut = size;
    out.push(rest.slice(0, cut).trim()); rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out.filter(Boolean);
}

export function addDoc(name: string, text: string): { id: string; passages: number } | { error: "empty" | "too_large" | "name" } {
  const n = name.trim().slice(0, 120);
  if (!n) return { error: "name" };
  if (!text.trim()) return { error: "empty" };
  if (text.length > MAX_CHARS) return { error: "too_large" };
  const id = crypto.randomUUID(), parts = split(text);
  const ins = db.query("INSERT INTO kb_fts (doc_id, passage, folded) VALUES (?, ?, ?)");
  db.transaction(() => {
    db.query("INSERT INTO kb_docs (id, name, chars, added) VALUES (?, ?, ?, ?)").run(id, n, text.length, Date.now());
    for (const p of parts) ins.run(id, p, fold(p));
  })();
  return { id, passages: parts.length };
}

export const listDocs = () => db.query<{ id: string; name: string; chars: number; added: number; folder: string }, []>("SELECT id, name, chars, added, folder FROM kb_docs ORDER BY added DESC").all();

/** Put a document in a folder ("" takes it out). A folder exists while at least one document is in it. */
export function setFolder(id: string, folder: unknown): boolean {
  const f = typeof folder === "string" ? folder.trim().slice(0, 60) : "";
  return db.query("UPDATE kb_docs SET folder = ? WHERE id = ?").run(f, id).changes > 0;
}
export const folders = (): { folder: string; count: number }[] => db.query<{ folder: string; count: number }, []>("SELECT folder, COUNT(*) AS count FROM kb_docs WHERE folder != '' GROUP BY folder ORDER BY folder").all();

export function removeDoc(id: string): boolean {
  let hit = false;
  db.transaction(() => { hit = db.query("DELETE FROM kb_docs WHERE id = ?").run(id).changes > 0; db.query("DELETE FROM kb_fts WHERE doc_id = ?").run(id); })();
  return hit;
}

/** Every word must appear (prefix match); user text is quoted so FTS operators cannot be injected. */
export function search(q: string, limit = 12): { docId: string; name: string; passage: string }[] {
  const words = fold(q).match(/[\p{L}\p{N}]+/gu)?.slice(0, 8) ?? [];
  if (!words.length) return [];
  const match = words.map((w) => `"${w}"*`).join(" ");
  return db.query<{ docId: string; name: string; passage: string }, [string, number]>(
    `SELECT f.doc_id AS docId, d.name AS name, substr(f.passage, 1, 240) AS passage
       FROM kb_fts f JOIN kb_docs d ON d.id = f.doc_id WHERE kb_fts MATCH ? ORDER BY bm25(kb_fts) LIMIT ?`).all(match, limit);
}

export function knowledgeApi(app: Hono) {
  app.get("/api/knowledge", (c) => c.json(listDocs()));
  app.get("/api/knowledge/search", (c) => c.json(search(c.req.query("q") ?? "")));
  app.post("/api/knowledge", async (c) => {
    const b = await c.req.json().catch(() => ({})) as { name?: unknown; text?: unknown };
    const r = addDoc(typeof b.name === "string" ? b.name : "", typeof b.text === "string" ? b.text : "");
    return "error" in r ? c.json(r, r.error === "too_large" ? 413 : 400) : c.json(r, 201);
  });
  // the whole text of one document, for the reader: its passages in the order they were cut
  app.get("/api/knowledge/:id/text", (c) => {
    const d = db.query<{ name: string }, [string]>("SELECT name FROM kb_docs WHERE id = ?").get(c.req.param("id"));
    if (!d) return c.json({ error: "not found" }, 404);
    return c.json({ name: d.name, text: db.query<{ passage: string }, [string]>("SELECT passage FROM kb_fts WHERE doc_id = ? ORDER BY rowid").all(c.req.param("id")).map((p) => p.passage).join("\n\n") });
  });
  app.get("/api/knowledge-folders", (c) => c.json(folders()));
  app.put("/api/knowledge/:id/folder", async (c) => { const b = await c.req.json().catch(() => ({})) as { folder?: unknown }; return setFolder(c.req.param("id"), b.folder) ? c.json({ ok: true }) : c.json({ error: "not found" }, 404); });
  app.delete("/api/knowledge/:id", (c) => (removeDoc(c.req.param("id")) ? c.json({ ok: true }) : c.json({ error: "not found" }, 404)));
}
