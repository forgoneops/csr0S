// One SQLite file for the whole core. Modules get a namespaced key-value store; a module that needs
// tables creates its own. Nothing in here knows about any particular module.
import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// A compiled core has no source tree: there import.meta.dir is /$bunfs/root, so the default data dir must be
// the person's own (~/.local/share/caesaros, the same place tools/run-desktop.sh uses), never a path in the bundle.
const fromSource = existsSync(join(import.meta.dir, "..", "package.json"));
export const DATA = process.env.CAESAROS_DATA
  ?? (fromSource ? join(import.meta.dir, "..", "data") : join(homedir(), ".local", "share", "caesaros"));
mkdirSync(DATA, { recursive: true });

// A restore the person approved is applied here, before the database opens: the current file is kept in
// backups/ first, so a restore can always be undone by restoring that copy.
const pending = join(DATA, "restore-pending.db");
if (existsSync(pending)) {
  const live = join(DATA, "caesaros.db");
  if (existsSync(live)) {
    mkdirSync(join(DATA, "backups"), { recursive: true });
    // A consistent pre-restore snapshot, not a raw copy: with WAL the live -wal may hold
    // un-checkpointed writes, and copying only the main file would lose them from the undo backup.
    const bak = join(DATA, "backups", `caesaros-pre-restore-${Date.now()}.db`);
    const snap = new Database(live, { readonly: true });
    try { snap.exec(`VACUUM INTO '${bak.replace(/'/g, "''")}'`); } finally { snap.close(); }
  }
  for (const x of ["", "-wal", "-shm"]) rmSync(live + x, { force: true });
  renameSync(pending, live);
}

export const db = new Database(join(DATA, "caesaros.db"), { create: true });
db.exec("PRAGMA journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS kv (ns TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY (ns, key));
`);

export function kv(ns: string) {
  const get = db.query<{ value: string }, [string, string]>("SELECT value FROM kv WHERE ns = ? AND key = ?");
  const set = db.query("INSERT INTO kv (ns, key, value) VALUES (?, ?, ?) ON CONFLICT (ns, key) DO UPDATE SET value = excluded.value");
  const del = db.query("DELETE FROM kv WHERE ns = ? AND key = ?");
  return {
    get<T>(key: string, fallback: T): T { const row = get.get(ns, key); return row ? (JSON.parse(row.value) as T) : fallback; },
    set(key: string, value: unknown) { set.run(ns, key, JSON.stringify(value)); },
    delete(key: string) { del.run(ns, key); },
  };
}
export type KV = ReturnType<typeof kv>;
