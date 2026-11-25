// Backup: one consistent copy of the core database (settings, chats, keys, module data)
// in <data>/backups, listed, downloadable and deletable. The file holds the model-server keys, so every route
// here is for the operator only. Restore is a separate, later step: it needs a restart and a preview.
// shortcut: notes live as plain files in <data>/notes and are not copied here; add them with the restore step.
import type { Context, Hono } from "hono";
import { chmodSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { Database } from "bun:sqlite";
import { join } from "node:path";
import { DATA, db } from "./db";

const NAME = /^caesaros-(\d{8}-\d{6}(-\d+)?|pre-restore-\d+)\.db$/;
const dir = () => join(DATA, "backups");

export function createBackup(now = new Date()): string {
  mkdirSync(dir(), { recursive: true, mode: 0o700 });
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  let name = `caesaros-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}.db`;
  let file = join(dir(), name), n = 1;
  while (existsSync(file)) file = join(dir(), name.replace(/\.db$/, `-${++n}.db`));   // two backups in one second, VACUUM INTO refuses an existing file
  name = file.slice(dir().length + 1);
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`); // a consistent snapshot even while the core is writing
  chmodSync(file, 0o600);
  return name;
}

export function listBackups(): { name: string; sizeMb: number; at: number }[] {
  try {
    return readdirSync(dir()).filter((n) => NAME.test(n)).map((name) => { const s = statSync(join(dir(), name)); return { name, sizeMb: Math.round((s.size / 1024 ** 2) * 10) / 10, at: s.mtimeMs }; }).sort((a, b) => b.at - a.at);
  } catch { return []; }
}

const pendingFile = () => join(DATA, "restore-pending.db");

/** Look inside a file before anything is replaced: it must be a CaesarOS database; counts are shown to the person. */
export function previewBackupFile(file: string): { ok: true; settings: boolean; kv: number } | { ok: false } {
  try {
    const d = new Database(file, { readonly: true });
    try {
      if (d.query("PRAGMA integrity_check").get() && (d.query("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check !== "ok") return { ok: false };
      if (!d.query("SELECT 1 FROM sqlite_master WHERE name = 'kv'").get()) return { ok: false };
      const kv = (d.query("SELECT COUNT(*) AS n FROM kv").get() as { n: number }).n;
      return { ok: true, settings: !!d.query("SELECT 1 FROM kv WHERE ns = 'core' LIMIT 1").get(), kv };
    } finally { d.close(); }
  } catch { return { ok: false }; }
}

export function backupApi(app: Hono, isOperator: (c: Context) => boolean) {
  const guard = (c: Context) => (isOperator(c) ? null : c.json({ error: "operator_only" }, 403));
  app.get("/api/backup", (c) => guard(c) ?? c.json(listBackups()));
  app.post("/api/backup", (c) => guard(c) ?? c.json({ name: createBackup() }, 201));
  app.get("/api/backup/restore", (c) => guard(c) ?? c.json({ pending: existsSync(pendingFile()) }));
  app.get("/api/backup/:name", (c) => {
    const g = guard(c); if (g) return g;
    const name = c.req.param("name");
    if (!NAME.test(name) || !listBackups().some((b) => b.name === name)) return c.json({ error: "not found" }, 404);
    return new Response(Bun.file(join(dir(), name)), { headers: { "content-type": "application/octet-stream", "content-disposition": `attachment; filename="${name}"`, "cache-control": "no-store" } });
  });
  // Restore, step 1: upload a file; it is checked and kept as "pending", nothing live changes.
  app.post("/api/backup/restore", async (c) => {
    const g = guard(c); if (g) return g;
    if (Number(c.req.header("content-length") ?? 0) > 512 * 1024 ** 2) return c.json({ error: "bad_file" }, 400);   // refused before anything is read into memory
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    if (!bytes.length || bytes.length > 512 * 1024 ** 2) return c.json({ error: "bad_file" }, 400);
    const tmp = join(DATA, "restore-upload.db");
    writeFileSync(tmp, bytes, { mode: 0o600 });
    const p = previewBackupFile(tmp);
    if (!p.ok) { rmSync(tmp, { force: true }); return c.json({ error: "not_a_backup" }, 400); }
    rmSync(pendingFile(), { force: true }); await Bun.write(pendingFile(), Bun.file(tmp)); rmSync(tmp, { force: true });
    return c.json({ pending: true, entries: p.kv });
  });
  app.delete("/api/backup/restore", (c) => { const g = guard(c); if (g) return g; rmSync(pendingFile(), { force: true }); return c.json({ ok: true }); });
  app.delete("/api/backup/:name", (c) => {
    const g = guard(c); if (g) return g;
    const name = c.req.param("name");
    if (!NAME.test(name)) return c.json({ error: "not found" }, 404);
    try { unlinkSync(join(dir(), name)); return c.json({ ok: true }); } catch { return c.json({ error: "not found" }, 404); }
  });
}
