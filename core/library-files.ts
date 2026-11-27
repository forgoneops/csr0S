// Library files: PDFs, slide decks (pptx, odp, ppt, self-contained deck html) and office documents, kept as they are.
// Text documents live in knowledge.ts; these are the binary ones. Previews are pages rendered on demand: office files go
// through soffice once (cached as pdf), pdf pages through pdftoppm. Both are light command-line tools; without them the
// original still opens and downloads. Nothing is seeded: the shelf starts empty.
import type { Hono } from "hono";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { db, DATA } from "./db";

const DIR = join(DATA, "library"), CACHE = join(DIR, "cache");
mkdirSync(CACHE, { recursive: true });
db.exec("CREATE TABLE IF NOT EXISTS lib_files (id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL, ext TEXT NOT NULL, bytes INTEGER NOT NULL, folder TEXT NOT NULL DEFAULT '', added INTEGER NOT NULL)");
// the trash is a column, not a folder: a trashed file stays on disk until the person deletes it for good
if (!db.query("SELECT 1 FROM pragma_table_info('lib_files') WHERE name = 'trashed'").get()) db.exec("ALTER TABLE lib_files ADD COLUMN trashed INTEGER NOT NULL DEFAULT 0");

export const MAX_BYTES = 80 * 1024 * 1024;
export const KINDS: Record<string, string> = { pdf: "pdf", pptx: "deck", ppt: "deck", odp: "deck", html: "deck", docx: "doc", doc: "doc", odt: "doc", rtf: "doc" };
const MIME: Record<string, string> = { pdf: "application/pdf", html: "text/html; charset=utf-8", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", odp: "application/vnd.oasis.opendocument.presentation", odt: "application/vnd.oasis.opendocument.text" };

type Row = { id: string; name: string; kind: string; ext: string; bytes: number; folder: string; added: number; trashed: number };
const row = (id: string) => db.query<Row, [string]>("SELECT * FROM lib_files WHERE id = ?").get(id);
const path = (r: Row) => join(DIR, `${r.id}.${r.ext}`);

/** Splits "Deck.v2.PPTX" into a clean title and a lower-case extension; null when the format is not one we keep. */
export function parseName(raw: string): { name: string; ext: string } | null {
  const base = raw.replace(/\\/g, "/").split("/").pop()!.trim();
  const dot = base.lastIndexOf("."), ext = dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
  if (!(ext in KINDS)) return null;
  return { name: base.slice(0, dot).trim().slice(0, 120) || "Untitled", ext };
}

async function run(cmd: string[], timeout = 90_000): Promise<{ ok: boolean; out: string }> {
  try {
    const p = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
    const timer = setTimeout(() => p.kill(), timeout);
    const out = await new Response(p.stdout).text(); await p.exited; clearTimeout(timer);
    return { ok: p.exitCode === 0, out };
  } catch { return { ok: false, out: "" }; }
}

const texts = new Map<string, string>();
/** Plain text of a file, from pdftotext, kept in memory per run (shortcut: no on-disk index, fine for a personal shelf). */
async function textOf(r: Row): Promise<string> {
  const hit = texts.get(r.id); if (hit !== undefined) return hit;
  const pdf = await pdfOf(r), t = pdf ? (await run(["pdftotext", "-layout", pdf, "-"], 40_000)).out : "";
  texts.set(r.id, t); return t;
}

const converting = new Map<string, Promise<string | null>>();
/** A conversion writes into the preview cache; the Storage page waits for it before clearing. */
export const previewsBusy = () => converting.size > 0;
/** The pdf to draw pages from: the file itself, or soffice's conversion, made once and cached. */
async function pdfOf(r: Row): Promise<string | null> {
  if (r.ext === "pdf") return path(r);
  if (r.ext === "html") return null;
  const out = join(CACHE, `${r.id}.pdf`);
  if (existsSync(out)) return out;
  let job = converting.get(r.id);
  if (!job) {
    job = (async () => {
      const prof = join(CACHE, `profile-${r.id}`), dir = join(CACHE, `out-${r.id}`);
      const res = await run(["soffice", `-env:UserInstallation=file://${prof}`, "--headless", "--convert-to", "pdf", "--outdir", dir, path(r)]);
      rmSync(prof, { recursive: true, force: true });
      const made = join(dir, `${r.id}.pdf`);
      if (res.ok && existsSync(made)) { writeFileSync(out, readFileSync(made)); rmSync(dir, { recursive: true, force: true }); return out; }
      return null;
    })().finally(() => converting.delete(r.id));
    converting.set(r.id, job);
  }
  return job;
}

export function libraryFilesApi(app: Hono) {
  app.get("/api/library/files", (c) => c.json(db.query<Row, []>(`SELECT * FROM lib_files WHERE ${c.req.query("trash") ? "trashed > 0" : "trashed = 0"} ORDER BY added DESC`).all()));
  // search inside: the text of every kept pdf and document (office files through their cached pdf), best match first
  app.get("/api/library/files/search", async (c) => {
    const words = (c.req.query("q") ?? "").toLowerCase().match(/[\p{L}\p{N}]+/gu)?.slice(0, 6) ?? [];
    if (!words.length) return c.json([]);
    const out: { id: string; name: string; kind: string; snippet: string }[] = [];
    for (const r of db.query<Row, []>("SELECT * FROM lib_files WHERE trashed = 0 AND kind != 'deck'").all()) {
      const txt = await textOf(r), low = txt.toLowerCase();
      if (!words.every((w) => low.includes(w))) continue;
      const at = Math.max(0, low.indexOf(words[0]) - 60);
      out.push({ id: r.id, name: r.name, kind: r.kind, snippet: txt.slice(at, at + 200).replace(/\s+/g, " ").trim() });
    }
    return c.json(out.slice(0, 20));
  });
  app.post("/api/library/files", async (c) => {
    const p = parseName(c.req.query("name") ?? "");
    if (!p) return c.json({ error: "format" }, 400);
    if (Number(c.req.header("content-length") ?? 0) > MAX_BYTES) return c.json({ error: "too_large" }, 413);
    const buf = new Uint8Array(await c.req.arrayBuffer());
    if (!buf.length) return c.json({ error: "empty" }, 400);
    if (buf.length > MAX_BYTES) return c.json({ error: "too_large" }, 413);
    const id = crypto.randomUUID(), kind = KINDS[p.ext];
    writeFileSync(join(DIR, `${id}.${p.ext}`), buf);
    db.query("INSERT INTO lib_files (id, name, kind, ext, bytes, folder, added) VALUES (?, ?, ?, ?, ?, '', ?)").run(id, p.name, kind, p.ext, buf.length, Date.now());
    return c.json({ id, kind }, 201);
  });
  app.get("/api/library/files/:id/raw", (c) => {
    const r = row(c.req.param("id")); if (!r || !existsSync(path(r))) return c.json({ error: "not found" }, 404);
    const h: Record<string, string> = { "content-type": MIME[r.ext] ?? "application/octet-stream", "x-content-type-options": "nosniff", "content-disposition": `${c.req.query("dl") ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(r.name + "." + r.ext)}` };
    // a deck page is someone else's html: it runs sandboxed, with no access to this app
    if (r.ext === "html") h["content-security-policy"] = "sandbox allow-scripts";
    return new Response(Bun.file(path(r)), { headers: h });
  });
  // preview pages: how many, then one at a time as png (works on a phone, where an embedded pdf does not)
  app.get("/api/library/files/:id/pages", async (c) => {
    const r = row(c.req.param("id")); if (!r) return c.json({ error: "not found" }, 404);
    const pdf = await pdfOf(r); if (!pdf) return c.json({ pages: 0, reason: r.ext === "html" ? "html" : "no_converter" });
    const info = await run(["pdfinfo", pdf], 20_000), n = Number(/Pages:\s+(\d+)/.exec(info.out)?.[1] ?? 0);
    return c.json({ pages: n, reason: n ? "" : "no_renderer" });
  });
  app.get("/api/library/files/:id/page/:n", async (c) => {
    const r = row(c.req.param("id")), n = Math.floor(Number(c.req.param("n")));
    if (!r || !(n >= 1 && n <= 2000)) return c.json({ error: "not found" }, 404);
    const pdf = await pdfOf(r); if (!pdf) return c.json({ error: "no preview" }, 501);
    const base = join(CACHE, `${r.id}-${n}`);
    if (!existsSync(base + ".png")) { const res = await run(["pdftoppm", "-png", "-r", "90", "-f", String(n), "-l", String(n), "-singlefile", pdf, base], 40_000); if (!res.ok || !existsSync(base + ".png")) return c.json({ error: "no preview" }, 501); }
    return new Response(Bun.file(base + ".png"), { headers: { "content-type": "image/png", "cache-control": "private, max-age=3600" } });
  });
  app.post("/api/library/files/:id/trash", (c) => (db.query("UPDATE lib_files SET trashed = ? WHERE id = ?").run(Date.now(), c.req.param("id")).changes ? c.json({ ok: true }) : c.json({ error: "not found" }, 404)));
  app.post("/api/library/files/:id/restore", (c) => (db.query("UPDATE lib_files SET trashed = 0 WHERE id = ?").run(c.req.param("id")).changes ? c.json({ ok: true }) : c.json({ error: "not found" }, 404)));
  // delete for good: only what is already in the trash
  app.delete("/api/library/files/:id", (c) => {
    const r = row(c.req.param("id")); if (!r) return c.json({ error: "not found" }, 404);
    if (!r.trashed) return c.json({ error: "trash first" }, 409);
    texts.delete(r.id);
    db.query("DELETE FROM lib_files WHERE id = ?").run(r.id);
    rmSync(path(r), { force: true });
    for (const f of new Bun.Glob(`*${r.id}*`).scanSync(CACHE)) rmSync(join(CACHE, f), { recursive: true, force: true });
    return c.json({ ok: true });
  });
}
