// The local mail store (plan: Mail, first version): one SQLite file with message headers and the TEXT of each message, plus full-text
// search. No raw .eml, no HTML and no attachment bytes are kept. Everything here works offline. The file lives in DATA/mail/, outside
// the core database, so a backup of the core never carries mail. Ported from the old cockpit mail plugin (behaviour only).
import type { Database } from "bun:sqlite";
import { parseMessage, threadKey, type Addr } from "./mail-parse";

export type Flags = { seen: boolean; flagged: boolean; answered: boolean };
export type Folder = { account: string; path: string; name: string; special: string; uidValidity: number; lastUid: number; total: number; unread: number; syncedAt: number };
export type MessageRow = { id: number; account: string; folder: string; uid: number; messageId: string; thread: string; subject: string; from: Addr; to: Addr[]; cc: Addr[]; date: number; snippet: string; seen: boolean; flagged: boolean; answered: boolean; hasAttachment: boolean; size: number };
export type ListQuery = { account?: string; folder?: string; q?: string; unread?: boolean; flagged?: boolean; thread?: string; before?: number; limit?: number };
export const MAX_BODY = 200_000;

const ftsQuery = (q: string) => q.split(/\s+/).map((t) => t.replace(/["*^():{}\\-]/g, "")).filter(Boolean).map((t) => `"${t}"*`).join(" ");

export function createStore(db: Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS mail_folders (account TEXT NOT NULL, path TEXT NOT NULL, name TEXT NOT NULL, special TEXT NOT NULL DEFAULT '', uidvalidity INTEGER NOT NULL DEFAULT 0, last_uid INTEGER NOT NULL DEFAULT 0, synced_at INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (account, path));
    CREATE TABLE IF NOT EXISTS mail_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, account TEXT NOT NULL, folder TEXT NOT NULL, uid INTEGER NOT NULL, message_id TEXT NOT NULL DEFAULT '', thread TEXT NOT NULL DEFAULT '', subject TEXT NOT NULL DEFAULT '', from_name TEXT NOT NULL DEFAULT '', from_addr TEXT NOT NULL DEFAULT '', to_json TEXT NOT NULL DEFAULT '[]', cc_json TEXT NOT NULL DEFAULT '[]', date INTEGER NOT NULL DEFAULT 0, snippet TEXT NOT NULL DEFAULT '', seen INTEGER NOT NULL DEFAULT 0, flagged INTEGER NOT NULL DEFAULT 0, answered INTEGER NOT NULL DEFAULT 0, has_attach INTEGER NOT NULL DEFAULT 0, size INTEGER NOT NULL DEFAULT 0, body TEXT NOT NULL DEFAULT '', UNIQUE (account, folder, uid));
    CREATE INDEX IF NOT EXISTS mail_by_folder ON mail_messages (account, folder, date DESC); CREATE INDEX IF NOT EXISTS mail_by_thread ON mail_messages (thread);
    CREATE VIRTUAL TABLE IF NOT EXISTS mail_fts USING fts5(subject, sender, recipients, body, tokenize = 'unicode61 remove_diacritics 2');
  `);
  const q = <T>(sql: string, ...a: (string | number | null)[]) => db.query<T, (string | number | null)[]>(sql).all(...a);
  const one = <T>(sql: string, ...a: (string | number | null)[]) => db.query<T, (string | number | null)[]>(sql).get(...a) ?? null;

  const toFolder = (r: any): Folder => ({ account: r.account, path: r.path, name: r.name, special: r.special, uidValidity: r.uidvalidity, lastUid: r.last_uid, total: r.total ?? 0, unread: r.unread ?? 0, syncedAt: r.synced_at });
  const folders = (account: string): Folder[] => q<any>(`SELECT f.*, (SELECT COUNT(*) FROM mail_messages m WHERE m.account = f.account AND m.folder = f.path) total, (SELECT COUNT(*) FROM mail_messages m WHERE m.account = f.account AND m.folder = f.path AND m.seen = 0) unread FROM mail_folders f WHERE f.account = ? ORDER BY f.name`, account).map(toFolder);
  const folder = (account: string, path: string): Folder | null => { const r = one<any>(`SELECT f.*, 0 total, 0 unread FROM mail_folders f WHERE account = ? AND path = ?`, account, path); return r ? toFolder(r) : null; };
  const upsertFolder = (account: string, path: string, name: string, special = "") => db.query("INSERT INTO mail_folders (account, path, name, special) VALUES (?,?,?,?) ON CONFLICT (account, path) DO UPDATE SET name = excluded.name, special = excluded.special").run(account, path, name, special);
  const setFolderState = (account: string, path: string, uidValidity: number, lastUid: number, at: number) => db.query("UPDATE mail_folders SET uidvalidity = ?, last_uid = ?, synced_at = ? WHERE account = ? AND path = ?").run(uidValidity, lastUid, at, account, path);

  const toRow = (r: any): MessageRow => ({ id: r.id, account: r.account, folder: r.folder, uid: r.uid, messageId: r.message_id, thread: r.thread, subject: r.subject, from: { name: r.from_name, address: r.from_addr }, to: JSON.parse(r.to_json), cc: JSON.parse(r.cc_json), date: r.date, snippet: r.snippet, seen: !!r.seen, flagged: !!r.flagged, answered: !!r.answered, hasAttachment: !!r.has_attach, size: r.size });
  const COLS = "id, account, folder, uid, message_id, thread, subject, from_name, from_addr, to_json, cc_json, date, snippet, seen, flagged, answered, has_attach, size";   // never the body: the list stays light
  const uids = (account: string, folderPath: string) => new Map(q<{ uid: number; seen: number; flagged: number; answered: number }>("SELECT uid, seen, flagged, answered FROM mail_messages WHERE account = ? AND folder = ?", account, folderPath).map((r) => [r.uid, { seen: !!r.seen, flagged: !!r.flagged, answered: !!r.answered }]));

  /** keep a message: parse it, keep its headers and text, make it searchable. The raw bytes are dropped. */
  async function add(account: string, folderPath: string, uid: number, raw: Buffer, flags: Flags, size = raw.length): Promise<number> {
    const p = await parseMessage(raw), body = (p.text || p.snippet).slice(0, MAX_BODY);
    const r = db.query("INSERT INTO mail_messages (account, folder, uid, message_id, thread, subject, from_name, from_addr, to_json, cc_json, date, snippet, seen, flagged, answered, has_attach, size, body) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT (account, folder, uid) DO NOTHING")
      .run(account, folderPath, uid, p.messageId, threadKey(p), p.subject, p.from.name, p.from.address, JSON.stringify(p.to), JSON.stringify(p.cc), p.date, p.snippet, +flags.seen, +flags.flagged, +flags.answered, +p.attachments.some((a) => !a.inline), size, body);
    const id = one<{ id: number }>("SELECT id FROM mail_messages WHERE account = ? AND folder = ? AND uid = ?", account, folderPath, uid)!.id;
    if (r.changes) db.query("INSERT INTO mail_fts (rowid, subject, sender, recipients, body) VALUES (?,?,?,?,?)").run(id, p.subject, `${p.from.name} ${p.from.address}`, [...p.to, ...p.cc].map((a) => `${a.name} ${a.address}`).join(" "), body);
    return id;
  }
  const setFlags = (id: number, f: Partial<Flags>) => { for (const k of ["seen", "flagged", "answered"] as const) if (f[k] !== undefined) db.query(`UPDATE mail_messages SET ${k} = ? WHERE id = ?`).run(+f[k]!, id); };
  function remove(account: string, folderPath: string, gone: number[]) {
    for (const uid of gone) {
      const row = one<{ id: number }>("SELECT id FROM mail_messages WHERE account = ? AND folder = ? AND uid = ?", account, folderPath, uid); if (!row) continue;
      db.query("DELETE FROM mail_fts WHERE rowid = ?").run(row.id); db.query("DELETE FROM mail_messages WHERE id = ?").run(row.id);
    }
  }
  const purgeFolder = (account: string, folderPath: string) => remove(account, folderPath, [...uids(account, folderPath).keys()]);
  const purgeAccount = (account: string) => { for (const f of folders(account)) purgeFolder(account, f.path); db.query("DELETE FROM mail_folders WHERE account = ?").run(account); };

  function list(f: ListQuery = {}): MessageRow[] {
    const w: string[] = [], a: (string | number)[] = [];
    if (f.account) { w.push("m.account = ?"); a.push(f.account); } if (f.folder) { w.push("m.folder = ?"); a.push(f.folder); }
    if (f.unread) w.push("m.seen = 0"); if (f.flagged) w.push("m.flagged = 1"); if (f.thread) { w.push("m.thread = ?"); a.push(f.thread); }
    if (f.before) { w.push("m.date < ?"); a.push(f.before); }
    const match = f.q ? ftsQuery(f.q) : ""; if (match) { w.push("m.id IN (SELECT rowid FROM mail_fts WHERE mail_fts MATCH ?)"); a.push(match); }
    return q<any>(`SELECT ${COLS.split(", ").map((c) => "m." + c).join(", ")} FROM mail_messages m ${w.length ? `WHERE ${w.join(" AND ")}` : ""} ORDER BY m.date DESC, m.id DESC LIMIT ?`, ...a, Math.min(Math.max(f.limit ?? 50, 1), 200)).map(toRow);
  }
  const idOf = (account: string, folderPath: string, uid: number): number | null => one<{ id: number }>("SELECT id FROM mail_messages WHERE account = ? AND folder = ? AND uid = ?", account, folderPath, uid)?.id ?? null;
  const get = (id: number): MessageRow | null => { const r = one<any>(`SELECT ${COLS} FROM mail_messages WHERE id = ?`, id); return r ? toRow(r) : null; };
  const text = (id: number): string | null => one<{ body: string }>("SELECT body FROM mail_messages WHERE id = ?", id)?.body ?? null;
  return { folders, folder, upsertFolder, setFolderState, uids, add, setFlags, remove, purgeFolder, purgeAccount, list, get, text, idOf, count: () => one<{ n: number }>("SELECT COUNT(*) n FROM mail_messages")!.n };
}
export type Store = ReturnType<typeof createStore>;
