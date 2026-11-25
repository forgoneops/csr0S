// Sending is the one step in mail that cannot be taken back, so it takes two: PREPARE shows exactly what would go out and returns a
// token bound to that exact message; CONFIRM sends it. Change the draft after preparing and the token no longer fits.
// Agents may write drafts; the send is the operator's card. Every send leaves a row in the evidence ledger.
import type { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { tryRecord } from "./audit";
import { ComposeError, buildRaw, normalize, replyTo, forward, sendPlan, show, type Draft, type DraftInput } from "./mail-compose";
import type { Account } from "./mail";
import type { Addr } from "./mail-parse";
import type { Store } from "./mail-store";
import type { MailSource } from "./mail-sync";

/** What the ledger gets: who, which draft, what happened. Never a password, an address or a subject: quoted text is blanked. */
type Rec = { actor: string; subjectId: string; confidence: string; claim: string };
const toAudit = (e: Rec) => tryRecord({ source: "ui", actor: e.actor, subjectKind: "mail", subjectId: String(e.subjectId).slice(0, 100), confidence: e.confidence === "seen" ? "seen" : e.confidence === "done" ? "done" : "blocked", claim: String(e.claim).replace(/"[^"]*"/g, '"\u2026"').slice(0, 200) });
export type SmtpResult = { accepted: string[]; rejected: string[]; response: string };
export type Transport = (account: Account, password: string, raw: Buffer, envelope: { from: string; to: string[] }) => Promise<SmtpResult>;
type Pending = { sendId: string; draftId: string; hash: string; messageId: string; raw: Buffer; envelopeTo: string[]; plan: ReturnType<typeof sendPlan>; expires: number };
const TTL = 15 * 60_000;
const hashOf = (d: Draft) => createHash("sha256").update(JSON.stringify([d.account, d.to, d.cc, d.bcc, d.subject, d.text, d.inReplyTo, d.references, d.attachments.map((a) => [a.filename, a.dataBase64.length, createHash("sha1").update(a.dataBase64).digest("hex")])])).digest("hex");

export function createSender(db: Database, deps: { store: Store; account: (id: string) => Account | null; password: (id: string) => string | null; transport: Transport; source: (a: Account, pw: string) => MailSource; record?: (e: Rec) => unknown; now?: () => number }) {
  const now = deps.now ?? Date.now, record = (e: any) => (deps.record ?? toAudit)(e);
  db.exec(`CREATE TABLE IF NOT EXISTS mail_drafts (id TEXT PRIMARY KEY, account TEXT NOT NULL, json TEXT NOT NULL, updated_at INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS mail_sent (send_id TEXT PRIMARY KEY, draft_id TEXT NOT NULL, account TEXT NOT NULL, message_id TEXT NOT NULL, at INTEGER NOT NULL, accepted TEXT NOT NULL, rejected TEXT NOT NULL, approved_by TEXT NOT NULL);`);
  const pending = new Map<string, Pending>();
  const acct = (id: string) => { const a = deps.account(id); if (!a) throw new ComposeError("no such account"); return a; };
  const from = (a: Account): Addr => ({ name: a.fromName, address: a.address });
  const row = (id: string): Draft | null => { const r = db.query<{ json: string }, [string]>("SELECT json FROM mail_drafts WHERE id = ?").get(id); return r ? (JSON.parse(r.json) as Draft) : null; };
  const must = (id: string) => { const d = row(id); if (!d) throw new ComposeError("no such draft"); return d; };
  const put = (d: Draft) => db.query("INSERT INTO mail_drafts (id, account, json, updated_at) VALUES (?,?,?,?) ON CONFLICT (id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at, account = excluded.account").run(d.id, d.account, JSON.stringify(d), d.updatedAt);
  const subject = (id: string) => ({ subjectKind: "mail", subjectId: id.replace(/[^\w.:/@#-]/g, "_").slice(0, 100) });

  function saveDraft(i: DraftInput, id?: string): Draft { acct(i.account); const prev = id ? row(id) : null; if (id && !prev) throw new ComposeError("no such draft"); const d = normalize(i, id ?? `d-${now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`, now(), prev ?? undefined); put(d); for (const [k, p] of pending) if (p.draftId === d.id) pending.delete(k); return d; }
  const drafts = (account?: string): Draft[] => db.query<{ json: string }, []>("SELECT json FROM mail_drafts ORDER BY updated_at DESC").all().map((r) => JSON.parse(r.json) as Draft).filter((d) => !account || d.account === account);
  const deleteDraft = (id: string) => { must(id); db.query("DELETE FROM mail_drafts WHERE id = ?").run(id); for (const [k, p] of pending) if (p.draftId === id) pending.delete(k); };

  async function fromMessage(messageId: number, kind: "reply" | "replyAll" | "forward", by = "operator"): Promise<Draft> {
    const m = deps.store.get(messageId), text = deps.store.text(messageId); if (!m || text === null) throw new ComposeError("that message is not here");
    const a = acct(m.account), p = { messageId: m.messageId, references: [] as string[], subject: m.subject, from: m.from, to: m.to, cc: m.cc, date: m.date, text };
    return saveDraft({ account: a.id, createdBy: by, ...(kind === "forward" ? forward(p) : replyTo(p, a.address, kind === "replyAll")) });
  }

  /** step one: build the message, show the plan, hand back a token for exactly this message */
  async function prepare(draftId: string) {
    const d = must(draftId), a = acct(d.account), plan = sendPlan(d, from(a), a.address.split("@")[1]);
    if (plan.blocking) throw new ComposeError(plan.warnings[0]);
    const { raw, messageId, envelopeTo } = await buildRaw(d, from(a), a.address.split("@")[1]), sendId = `s-${now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    for (const [k, p] of pending) if (p.expires < now()) pending.delete(k);
    const hash = hashOf(d); pending.set(sendId, { sendId, draftId, hash, messageId, raw, envelopeTo, plan, expires: now() + TTL });
    record({ source: "approval", actor: d.createdBy === "operator" ? "operator" : d.createdBy, ...subject(`${a.id}:${draftId}`), phase: "ship", confidence: "blocked", claim: `Waiting for approval to send "${d.subject.slice(0, 80)}" to ${envelopeTo.length} recipient${envelopeTo.length === 1 ? "" : "s"}`, ref: `send:${sendId}` });
    return { sendId, hash, plan, size: raw.length, expiresAt: now() + TTL };
  }

  /** step two: the operator approved this exact message. Send it, keep a copy in Sent where the provider does not, record it. */
  async function confirm(sendId: string, hash: string, approvedBy = "operator") {
    const p = pending.get(sendId); if (!p || p.expires < now()) { pending.delete(sendId); throw new ComposeError("that approval has expired; prepare the message again"); }
    const d = must(p.draftId); if (hashOf(d) !== hash || p.hash !== hash) throw new ComposeError("the draft changed after it was prepared; review it again");
    const a = acct(d.account), pw = deps.password(a.id); if (!pw) throw new ComposeError("the password for this account is missing");
    pending.delete(sendId);
    let res: SmtpResult;
    try { res = await deps.transport(a, pw, p.raw, { from: a.address, to: p.envelopeTo }); }
    catch (e) { const msg = String((e as Error).message ?? e).slice(0, 160); record({ source: "approval", actor: approvedBy, ...subject(`${a.id}:${d.id}`), phase: "ship", confidence: "failed", claim: `Sending "${d.subject.slice(0, 80)}" failed: ${msg}`, ref: `send:${sendId}` }); throw new ComposeError(`the server did not accept the message: ${msg}`); }
    if (!res.accepted.length) { record({ source: "approval", actor: approvedBy, ...subject(`${a.id}:${d.id}`), phase: "ship", confidence: "failed", claim: `No recipient accepted "${d.subject.slice(0, 80)}"`, ref: `send:${sendId}` }); throw new ComposeError(`no recipient was accepted (${res.rejected.join(", ") || res.response})`); }
    db.query("INSERT INTO mail_sent (send_id, draft_id, account, message_id, at, accepted, rejected, approved_by) VALUES (?,?,?,?,?,?,?,?)").run(sendId, d.id, a.id, p.messageId, now(), JSON.stringify(res.accepted), JSON.stringify(res.rejected), approvedBy);
    let savedCopy = false;
    if (a.saveSent) { const sent = deps.store.folders(a.id).find((f) => f.special === "\\Sent"); if (sent) { const src = deps.source(a, pw); try { await src.open(sent.path); await src.append(sent.path, p.raw, { seen: true }); savedCopy = true; } catch { /* the provider keeps its own copy or refused; the send itself succeeded */ } finally { await src.close(); } } }
    db.query("DELETE FROM mail_drafts WHERE id = ?").run(d.id);
    record({ source: "approval", actor: approvedBy, ...subject(`${a.id}:${d.id}`), phase: "ship", confidence: "seen", claim: `Sent "${d.subject.slice(0, 80)}": ${res.accepted.length} accepted${res.rejected.length ? `, ${res.rejected.length} rejected` : ""}. Delivery to the inbox is not confirmed.`, ref: `send:${sendId}`, meta: { messageId: p.messageId, savedCopy } });
    return { sent: true, messageId: p.messageId, accepted: res.accepted, rejected: res.rejected, response: res.response.slice(0, 120), savedCopy };
  }
  const cancel = (sendId: string) => { const p = pending.get(sendId); pending.delete(sendId); if (p) record({ source: "approval", actor: "operator", ...subject(`${acct(must(p.draftId).account).id}:${p.draftId}`), phase: "ship", confidence: "cancelled", claim: "The send was not approved", ref: `send:${sendId}` }); return { ok: true }; };
  return { saveDraft, drafts, getDraft: must, deleteDraft, fromMessage, prepare, confirm, cancel, pendingCount: () => pending.size, show };
}
export type Sender = ReturnType<typeof createSender>;
