// Pull mail from a provider's server into the local store. The wire protocol sits behind MailSource so the logic here
// (what is new, what is gone, what changed, what to do when the server renumbers) is tested without a server.
import type { Flags, Store } from "./mail-store";

export type RemoteFolder = { path: string; name: string; special?: string };
export type OpenedFolder = { uidValidity: number; uidNext: number; exists: number };
export type RemoteMessage = { uid: number; source: Buffer; size: number; flags: Flags };
export interface MailSource {
  folders(): Promise<RemoteFolder[]>;
  open(path: string): Promise<OpenedFolder>;
  /** every UID in the open folder with its flags: one cheap listing */
  flags(path: string): Promise<Map<number, Flags>>;
  fetch(path: string, uids: number[]): AsyncIterable<RemoteMessage>;
  setFlag(path: string, uid: number, flag: keyof Flags, value: boolean): Promise<void>;
  /** put a copy of a message in a folder (the Sent folder after sending) */
  append(path: string, raw: Buffer, flags: Partial<Flags>): Promise<void>;
  close(): Promise<void>;
}
export type SyncStats = { folders: number; added: number; removed: number; updated: number; resynced: string[]; errors: string[] };
export const SKIP_SPECIAL = new Set(["\\Junk", "\\All"]);   // large and rarely read: left for on-demand

export async function syncAccount(source: MailSource, store: Store, account: string, opts: { first?: number; max?: number; batch?: number; now?: () => number; only?: string[] } = {}): Promise<SyncStats> {
  const { first = 300, max = 2000, batch = 40, now = Date.now } = opts, stats: SyncStats = { folders: 0, added: 0, removed: 0, updated: 0, resynced: [], errors: [] };
  for (const f of await source.folders()) {
    if (opts.only && !opts.only.includes(f.path)) continue;
    if (f.special && SKIP_SPECIAL.has(f.special) && !opts.only) { store.upsertFolder(account, f.path, f.name, f.special); continue; }
    try {
      store.upsertFolder(account, f.path, f.name, f.special ?? ""); stats.folders++;
      const opened = await source.open(f.path), known = store.folder(account, f.path);
      if (known && known.uidValidity && known.uidValidity !== opened.uidValidity) { store.purgeFolder(account, f.path); stats.resynced.push(f.path); }   // the server renumbered: our UIDs mean nothing now
      const have = store.uids(account, f.path), remote = await source.flags(f.path);
      const gone = [...have.keys()].filter((u) => !remote.has(u)); if (gone.length) { store.remove(account, f.path, gone); stats.removed += gone.length; }
      const fresh = [...remote.keys()].filter((u) => !have.has(u)).sort((a, b) => b - a).slice(0, Math.min(have.size ? max : first, max)).reverse();
      for (let i = 0; i < fresh.length; i += batch) for await (const m of source.fetch(f.path, fresh.slice(i, i + batch))) { await store.add(account, f.path, m.uid, m.source, m.flags, m.size); stats.added++; }
      for (const [uid, flags] of remote) { const was = have.get(uid); if (was && (was.seen !== flags.seen || was.flagged !== flags.flagged || was.answered !== flags.answered)) { const id = store.idOf(account, f.path, uid); if (id !== null) { store.setFlags(id, flags); stats.updated++; } } }
      store.setFolderState(account, f.path, opened.uidValidity, Math.max(0, ...remote.keys()), now());
    } catch (e) { stats.errors.push(`${f.path}: ${(e as Error).message}`); }
  }
  return stats;
}
