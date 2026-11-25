// Accounts and their sync state. The source of mail is injected, so this is tested without a server.
import type { Secrets } from "./mail-secrets";
import type { Store } from "./mail-store";
import { syncAccount, type MailSource, type SyncStats } from "./mail-sync";
import type { Endpoint } from "./mail-presets";

import type { Database } from "bun:sqlite";
type KV = { get<T>(key: string, fallback: T): T; set(key: string, value: unknown): void };
/** a small key-value table inside the mail database: account settings live with the mail, outside the core database and its backups */
export function mailKv(db: Database): KV {
  db.exec("CREATE TABLE IF NOT EXISTS mail_kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  return { get: (k, fallback) => { const r = db.query<{ value: string }, [string]>("SELECT value FROM mail_kv WHERE key = ?").get(k); return r ? JSON.parse(r.value) : fallback; }, set: (k, v) => { db.query("INSERT INTO mail_kv (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(k, JSON.stringify(v)); } };
}

export type Account = { id: string; label: string; address: string; fromName: string; user: string; imap: Endpoint; smtp: Endpoint; allowSelfSigned: boolean; saveSent: boolean; addedAt: number };
export type AccountView = Account & { syncing: boolean; lastSync: number | null; lastStats: SyncStats | null; error: string; errorCode: ErrorCode | "" };
export type NewAccount = { address: string; label?: string; fromName?: string; user?: string; password: string; imap: Endpoint; smtp: Endpoint; allowSelfSigned?: boolean; saveSent?: boolean };
export type SourceFactory = (a: Account, password: string) => MailSource;
export class MailError extends Error {}

export function createManager(kv: KV, secrets: Secrets, store: Store, makeSource: SourceFactory, now: () => number = Date.now) {
  const status = new Map<string, { syncing: boolean; lastSync: number | null; lastStats: SyncStats | null; error: string; errorCode: ErrorCode | "" }>();
  const accounts = (): Account[] => kv.get<Account[]>("accounts", []);
  const st = (id: string) => status.get(id) ?? { syncing: false, lastSync: null, lastStats: null, error: "", errorCode: "" };
  const view = (a: Account): AccountView => ({ ...a, ...st(a.id) });
  const ep = (e: Endpoint, what: string): Endpoint => { if (!e?.host || !/^[\w.-]+$/.test(e.host) || !Number.isInteger(e.port) || e.port < 1 || e.port > 65535) throw new MailError(`${what}: a server name and a port are required`); if (!e.secure && !e.starttls && !/^(127\.\d+\.\d+\.\d+|localhost|::1)$/.test(e.host)) throw new MailError(`${what}: an unencrypted connection is only allowed to this computer; choose SSL or STARTTLS`); return { host: e.host, port: e.port, secure: !!e.secure, starttls: !!e.starttls }; };

  /** connect, list the folders, hang up: the proof that the address, server and password agree */
  async function test(n: Pick<NewAccount, "address" | "user" | "password" | "imap" | "allowSelfSigned">): Promise<{ ok: true; folders: number } | { ok: false; error: string; code: ErrorCode }> {
    const a: Account = { id: "test", label: "", address: n.address, fromName: "", user: n.user || n.address, imap: ep(n.imap, "IMAP"), smtp: { host: "x", port: 1, secure: false }, allowSelfSigned: !!n.allowSelfSigned, saveSent: false, addedAt: 0 }, src = makeSource(a, n.password);
    try { const f = await src.folders(); return { ok: true, folders: f.length }; } catch (e) { return { ok: false, error: explain(e), code: classify(e) }; } finally { await src.close(); }
  }
  async function add(n: NewAccount): Promise<AccountView> {
    const address = n.address.trim().toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(address)) throw new MailError("that does not look like an email address");
    if (!n.password) throw new MailError("a password is required");
    if (accounts().some((a) => a.address === address)) throw new MailError("that account is already added");
    const id = `a-${now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
    const acc: Account = { id, label: (n.label ?? "").trim().slice(0, 40) || address, address, fromName: (n.fromName ?? "").trim().slice(0, 60), user: (n.user ?? "").trim() || address, imap: ep(n.imap, "IMAP"), smtp: ep(n.smtp, "SMTP"), allowSelfSigned: !!n.allowSelfSigned, saveSent: n.saveSent ?? true, addedAt: now() };
    secrets.set(id, n.password); kv.set("accounts", [...accounts(), acc]); return view(acc);
  }
  /** stop using an account: forget the password and the local copy. The mail on the provider's server is untouched. */
  function remove(id: string) {
    if (!accounts().some((a) => a.id === id)) throw new MailError("no such account");
    if (st(id).syncing) throw new MailError("a sync is running for this account; wait for it to finish, then remove it"); // checked before any purge
    store.purgeAccount(id); secrets.delete(id); kv.set("accounts", accounts().filter((a) => a.id !== id)); status.delete(id);
  }

  async function sync(id: string, opts: { only?: string[] } = {}): Promise<SyncStats> {
    const a = accounts().find((x) => x.id === id); if (!a) throw new MailError("no such account");
    if (st(id).syncing) throw new MailError("a sync is already running for this account");
    const pw = secrets.get(id); if (!pw) throw new MailError("the password for this account is missing; add the account again");
    status.set(id, { ...st(id), syncing: true, error: "", errorCode: "" });
    const src = makeSource(a, pw);
    try { const stats = await syncAccount(src, store, id, { now, ...opts }); const f = explainFolders(stats.errors); status.set(id, { syncing: false, lastSync: now(), lastStats: stats, error: f.text, errorCode: f.code }); return stats; }
    catch (e) { status.set(id, { ...st(id), syncing: false, error: explain(e), errorCode: classify(e) }); throw e; }
    finally { await src.close(); }
  }
  /** change a flag here at once and on the provider's server when it can be reached */
  async function setFlag(messageId: number, flag: "seen" | "flagged", value: boolean) {
    const m = store.get(messageId); if (!m) throw new MailError("no such message"); store.setFlags(messageId, { [flag]: value });
    const a = accounts().find((x) => x.id === m.account), pw = a && secrets.get(a.id); if (!a || !pw) return { pushed: false };
    const src = makeSource(a, pw);
    try { await src.open(m.folder); await src.setFlag(m.folder, m.uid, flag, value); return { pushed: true }; } catch { return { pushed: false }; } finally { await src.close(); }
  }
  return { accounts: () => accounts().map(view), account: (id: string) => accounts().find((a) => a.id === id) ?? null, test, add, remove, sync, setFlag, status: st };
}
/** what the page may branch on: auth = wrong login, network = cannot reach the server, cert = secure connection, folder = one folder refused */
export type ErrorCode = "auth" | "network" | "cert" | "folder" | "unknown";
// imapflow keeps the real reason of a refused login outside message/code: message is just "Command failed", the server's words are in responseText
// and serverResponseCode, and authenticationFailed marks a refused LOGIN. Without them every bad login looked like a folder error.
const raw = (e: unknown) => { const x = e as { message?: string; code?: string; serverResponseCode?: string; responseText?: string; authenticationFailed?: boolean } | null; return [String(x?.message ?? e), String(x?.code ?? ""), String(x?.serverResponseCode ?? ""), String(x?.responseText ?? ""), x?.authenticationFailed ? "AUTHENTICATIONFAILED" : ""].filter(Boolean).join(" "); };
export const classify = (e: unknown): ErrorCode => {
  const t = raw(e);
  if (/AUTHENTICATIONFAILED|Invalid credentials|authentication failed|LOGIN failed/i.test(t)) return "auth";
  if (/certificate|SSL|TLS|EPROTO|ERR_SSL/i.test(t)) return "cert";
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|ECONNRESET|timeout/i.test(t)) return "network";
  if (/Command failed|mailbox|folder/i.test(t)) return "folder";
  return "unknown";
};
export const explain = (e: unknown): string => {
  const m = String((e as { message?: string })?.message ?? e), c = String((e as { code?: string })?.code ?? "");
  const all = raw(e);
  if (/Application-specific password|InvalidSecondFactor|app password/i.test(all)) return "Google wants an app password here, not your normal password. Turn on 2-step verification, create an app password for CAESAR and paste it.";
  if (/IMAP.{0,40}(disabled|not enabled)|enable.{0,20}IMAP|Web login required|WEBALERT/i.test(all)) return "Gmail has IMAP switched off for this account. In Gmail open Settings, then Forwarding and POP/IMAP, turn IMAP on and try again.";
  if (/AUTHENTICATIONFAILED|Invalid credentials|authentication failed|Authentication failed|LOGIN failed/i.test(all)) return "The server refused the login. Check the username and password (many providers need an app password).";
  if (/ENOTFOUND|EAI_AGAIN/.test(c + m)) return "The server name could not be found. Check the spelling of the IMAP server.";
  if (/ECONNREFUSED/.test(c + m)) return "Nothing is listening on that server and port (for Proton, is Proton Bridge running?).";
  if (/ETIMEDOUT|timeout|Timeout/.test(c + m)) return "The server did not answer in time.";
  if (/certificate|SSL|TLS|EPROTO|ERR_SSL/i.test(c + m)) return "The secure connection failed. Check the port and the security setting (SSL or STARTTLS).";
  if (/Command failed/i.test(m)) return "The server refused a command for this folder.";
  return m.slice(0, 200);
};
/** per-folder errors arrive as "<folder>: <message>"; each goes through explain() and the first decides the code */
export function explainFolders(errors: string[]): { text: string; code: ErrorCode | "" } {
  if (!errors.length) return { text: "", code: "" };
  const parts = errors.map((e) => { const i = e.indexOf(": "), folder = i > 0 ? e.slice(0, i) : "", msg = i > 0 ? e.slice(i + 2) : e; const code = classify(msg); return { code: folder && code === "unknown" ? "folder" as ErrorCode : code, text: (folder ? `${folder}: ` : "") + explain(msg) }; });
  return { text: parts.map((p) => p.text).join(" "), code: parts[0].code };
}

// ---- the assembled mail service and its routes (operator only) ----
import { Database as Db } from "bun:sqlite";
import type { Context, Hono } from "hono";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createSecrets } from "./mail-secrets";
import { createStore } from "./mail-store";
import { createSender, type Transport } from "./mail-sender";
import { imapSource } from "./mail-imap";
import { smtpTransport } from "./mail-smtp";
import { suggest } from "./mail-presets";
import { ComposeError } from "./mail-compose";

export type MailDeps = { dir: string; makeSource?: SourceFactory; transport?: Transport; now?: () => number };
export function createMail(d: MailDeps) {
  mkdirSync(d.dir, { recursive: true, mode: 0o700 });
  const db = new Db(join(d.dir, "mail.db")), secrets = createSecrets(join(d.dir, "secrets")), store = createStore(db), kv = mailKv(db);
  const makeSource: SourceFactory = d.makeSource ?? ((a, pw) => imapSource({ host: a.imap.host, port: a.imap.port, secure: a.imap.secure, user: a.user, pass: pw, allowSelfSigned: a.allowSelfSigned }));
  const manager = createManager(kv, secrets, store, makeSource, d.now);
  const sender = createSender(db, { store, account: manager.account, password: secrets.get, transport: d.transport ?? smtpTransport, source: makeSource, now: d.now });
  return { db, store, manager, sender };
}
export type Mail = ReturnType<typeof createMail>;

const num = (v: unknown) => (typeof v === "string" && /^\d+$/.test(v) ? Number(v) : NaN);
/** Every route is the operator's own: an agent token or an anonymous caller gets 403 before anything is read or sent. The password is never in an answer. */
export function mailApi(app: Hono, isOperator: (c: Context) => boolean, mail: () => Mail): void {
  app.use("/api/mail/*", async (c, next) => (isOperator(c) ? next() : c.json({ error: "operator_only" }, 403)));
  const fail = (c: Context, e: unknown) => c.json({ error: e instanceof MailError || e instanceof ComposeError ? e.message : "mail failed" }, e instanceof MailError || e instanceof ComposeError ? 400 : 500);
  const body = async (c: Context) => (await c.req.json().catch(() => ({}))) as Record<string, any>;
  const strip = <T extends object>(a: T): T => { const { password: _p, ...rest } = a as T & { password?: unknown }; return rest as T; };

  app.get("/api/mail/preset", (c) => c.json(suggest(c.req.query("address") ?? "") ?? { error: "no_suggestion" }));
  app.get("/api/mail/accounts", (c) => c.json(mail().manager.accounts()));
  app.post("/api/mail/accounts", async (c) => { try { return c.json(strip(await mail().manager.add(await body(c) as NewAccount)), 201); } catch (e) { return fail(c, e); } });
  app.delete("/api/mail/accounts/:id", (c) => { try { mail().manager.remove(c.req.param("id")); return c.json({ ok: true }); } catch (e) { return fail(c, e); } });
  app.post("/api/mail/test", async (c) => { try { return c.json(await mail().manager.test(await body(c) as NewAccount)); } catch (e) { return fail(c, e); } });
  app.post("/api/mail/accounts/:id/sync", async (c) => { try { return c.json(await mail().manager.sync(c.req.param("id"), { only: ["INBOX"] })); } catch (e) { return fail(c, e); } });
  app.get("/api/mail/folders", (c) => c.json(mail().store.folders(c.req.query("account") ?? "")));
  app.get("/api/mail/messages", (c) => { const q = c.req.query(); return c.json(mail().store.list({ account: q.account, folder: q.folder, q: q.q, unread: q.unread === "1", before: num(q.before) || undefined, limit: num(q.limit) || undefined })); });
  app.get("/api/mail/messages/:id", (c) => { const id = num(c.req.param("id")), m = mail().store.get(id); return m ? c.json({ ...m, text: mail().store.text(id) ?? "" }) : c.json({ error: "not_found" }, 404); });
  app.post("/api/mail/messages/:id/seen", async (c) => { try { return c.json(await mail().manager.setFlag(num(c.req.param("id")), "seen", (await body(c)).seen !== false)); } catch (e) { return fail(c, e); } });

  app.get("/api/mail/drafts", (c) => c.json(mail().sender.drafts(c.req.query("account"))));
  app.post("/api/mail/drafts", async (c) => { try { const b = await body(c); return c.json(mail().sender.saveDraft({ ...b, account: String(b.account ?? ""), createdBy: "operator" }), 201); } catch (e) { return fail(c, e); } });
  app.put("/api/mail/drafts/:id", async (c) => { try { const b = await body(c); return c.json(mail().sender.saveDraft({ ...b, account: String(b.account ?? ""), createdBy: "operator" }, c.req.param("id"))); } catch (e) { return fail(c, e); } });
  app.delete("/api/mail/drafts/:id", (c) => { try { mail().sender.deleteDraft(c.req.param("id")); return c.json({ ok: true }); } catch (e) { return fail(c, e); } });
  app.post("/api/mail/drafts/from/:id", async (c) => { try { const k = String((await body(c)).kind ?? "reply"); return c.json(await mail().sender.fromMessage(num(c.req.param("id")), k === "forward" ? "forward" : k === "replyAll" ? "replyAll" : "reply"), 201); } catch (e) { return fail(c, e); } });
  // sending takes two steps on purpose: prepare shows exactly what would go out; send is the click on Send and needs that step's token
  app.post("/api/mail/drafts/:id/prepare", async (c) => { try { return c.json(await mail().sender.prepare(c.req.param("id"))); } catch (e) { return fail(c, e); } });
  app.post("/api/mail/send", async (c) => { try { const b = await body(c); return c.json(await mail().sender.confirm(String(b.sendId ?? ""), String(b.hash ?? ""))); } catch (e) { return fail(c, e); } });
  app.post("/api/mail/send/cancel", async (c) => c.json(mail().sender.cancel(String((await body(c)).sendId ?? ""))));
}
