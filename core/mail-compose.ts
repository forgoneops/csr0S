// Writing mail: drafts, replies that thread properly, and the raw message that goes on the wire.
import MailComposer from "nodemailer/lib/mail-composer";
import type { Addr, Parsed } from "./mail-parse";

export type Attachment = { filename: string; contentType: string; dataBase64: string };
export type Draft = { id: string; account: string; to: Addr[]; cc: Addr[]; bcc: Addr[]; subject: string; text: string; inReplyTo: string; references: string[]; attachments: Attachment[]; createdBy: string; updatedAt: number };
export type DraftInput = Partial<Omit<Draft, "id" | "updatedAt">> & { account: string };
export class ComposeError extends Error {}
const MAX_ATTACH = 20 * 1024 * 1024;

/** "Ada <ada@example.org>, bob@example.net" to addresses; anything that is not an address is refused, not guessed at */
export function parseAddresses(input: string | Addr[] | undefined): Addr[] {
  if (!input) return []; if (Array.isArray(input)) return input.map((a) => norm(a.name, a.address));
  return input.split(/[,;]/).map((s) => s.trim()).filter(Boolean).map((s) => { const m = s.match(/^(?:"?([^"<]*?)"?\s*)?<([^>]+)>$/) ?? s.match(/^()([^\s<>]+@[^\s<>]+)$/); if (!m) throw new ComposeError(`"${s}" is not an email address`); return norm(m[1] ?? "", m[2]); });
}
function norm(name: string, address: string): Addr { const a = address.trim().toLowerCase(); if (!/^[^\s@<>,;"]+@[^\s@<>,;"]+\.[a-z]{2,}$/i.test(a)) throw new ComposeError(`"${address}" is not an email address`); if (/[\r\n]/.test(name)) throw new ComposeError("a name cannot contain a line break"); return { name: name.trim().replace(/[<>"]/g, ""), address: a }; }
export const show = (a: Addr) => (a.name ? `${a.name} <${a.address}>` : a.address);

/** the cleaned form of a draft: addresses valid, no header injection, sizes within limits */
export function normalize(i: DraftInput, id: string, now: number, prev?: Draft): Draft {
  const subject = (i.subject ?? prev?.subject ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, 300);
  const attachments = (i.attachments ?? prev?.attachments ?? []).map((a) => ({ filename: a.filename.replace(/[\\/\r\n"]+/g, "_").slice(0, 120) || "attachment", contentType: /^[\w.+-]+\/[\w.+-]+$/.test(a.contentType) ? a.contentType : "application/octet-stream", dataBase64: a.dataBase64 }));
  if (attachments.reduce((n, a) => n + Math.floor(a.dataBase64.length * 0.75), 0) > MAX_ATTACH) throw new ComposeError("attachments are limited to 20 MB together");
  const refs = (i.references ?? prev?.references ?? []).filter((r) => /^<[^<>\s]+>$/.test(r)).slice(-20), irt = /^<[^<>\s]+>$/.test(i.inReplyTo ?? prev?.inReplyTo ?? "") ? (i.inReplyTo ?? prev?.inReplyTo ?? "") : "";
  return { id, account: i.account, to: parseAddresses(i.to ?? prev?.to), cc: parseAddresses(i.cc ?? prev?.cc), bcc: parseAddresses(i.bcc ?? prev?.bcc), subject, text: (i.text ?? prev?.text ?? "").slice(0, 500_000), inReplyTo: irt, references: refs, attachments, createdBy: prev?.createdBy ?? i.createdBy ?? "operator", updatedAt: now };
}

/** a reply or a forward from a message the local store holds */
export function replyTo(p: Pick<Parsed, "messageId" | "references" | "subject" | "from" | "to" | "cc" | "date" | "text">, self: string, all: boolean): Pick<Draft, "to" | "cc" | "subject" | "text" | "inReplyTo" | "references"> {
  const mine = (a: Addr) => a.address === self.toLowerCase(), uniq = (l: Addr[]) => l.filter((a, i) => l.findIndex((b) => b.address === a.address) === i);
  const to = p.from.address && !mine(p.from) ? [p.from] : uniq(p.to).filter((a) => !mine(a)), cc = all ? uniq([...p.to, ...p.cc]).filter((a) => !mine(a) && !to.some((t) => t.address === a.address)) : [];
  const quoted = p.text.trim().split(/\r?\n/).slice(0, 200).map((l) => `> ${l}`).join("\n");
  return { to, cc, subject: /^re:/i.test(p.subject) ? p.subject : `Re: ${p.subject}`, text: `\n\nOn ${new Date(p.date).toUTCString()}, ${p.from.name || p.from.address} wrote:\n${quoted}\n`, inReplyTo: p.messageId, references: [...p.references, ...(p.messageId ? [p.messageId] : [])].slice(-20) };
}
export function forward(p: Pick<Parsed, "subject" | "from" | "to" | "date" | "text">): Pick<Draft, "subject" | "text"> {
  return { subject: /^(fwd?|fw):/i.test(p.subject) ? p.subject : `Fwd: ${p.subject}`, text: `\n\n---------- Forwarded message ----------\nFrom: ${show(p.from)}\nDate: ${new Date(p.date).toUTCString()}\nSubject: ${p.subject}\nTo: ${p.to.map(show).join(", ")}\n\n${p.text}\n` };
}

/** the message as it goes out: headers, a plain-text body, attachments, a fresh Message-ID. Bcc is not in the headers. */
export async function buildRaw(d: Draft, from: Addr, domain: string): Promise<{ raw: Buffer; messageId: string; envelopeTo: string[] }> {
  const messageId = `<${crypto.randomUUID()}@${domain}>`;
  const mail = new MailComposer({
    from: show(from), to: d.to.map(show), cc: d.cc.map(show), subject: d.subject, text: d.text, messageId, date: new Date(d.updatedAt), inReplyTo: d.inReplyTo || undefined, references: d.references.length ? d.references : undefined,
    headers: { "X-Mailer": "CAESAR Tabellae" }, attachments: d.attachments.map((a) => ({ filename: a.filename, contentType: a.contentType, content: Buffer.from(a.dataBase64, "base64") })),
  });
  const raw = await mail.compile().build();
  return { raw, messageId, envelopeTo: [...d.to, ...d.cc, ...d.bcc].map((a) => a.address).filter((a, i, l) => l.indexOf(a) === i) };
}

/** what the operator is asked to approve: who gets it, what it says, what could be a slip */
export function sendPlan(d: Draft, from: Addr, selfDomain: string) {
  const all = [...d.to, ...d.cc, ...d.bcc], domains = [...new Set(all.map((a) => a.address.split("@")[1]))], external = domains.filter((x) => x !== selfDomain);
  const warnings: string[] = []; if (!all.length) warnings.push("There is no recipient."); if (!d.subject.trim()) warnings.push("The subject is empty."); if (!d.text.trim() && !d.attachments.length) warnings.push("The message has no text and no attachment.");
  if (/\b(attached|attachment|załącz\w*|w załączeniu)\b/i.test(d.text) && !d.attachments.length) warnings.push("The text mentions an attachment, but nothing is attached.");
  if (d.bcc.length) warnings.push(`${d.bcc.length} recipient${d.bcc.length === 1 ? "" : "s"} in Bcc will not be shown to the others.`);
  if (all.length > 10) warnings.push(`This goes to ${all.length} people.`); if (d.createdBy !== "operator") warnings.push(`The draft was written by ${d.createdBy}.`);
  return { from: show(from), to: d.to.map(show), cc: d.cc.map(show), bcc: d.bcc.map(show), subject: d.subject, preview: d.text.trim().slice(0, 400), chars: d.text.length, attachments: d.attachments.map((a) => ({ filename: a.filename, bytes: Math.floor(a.dataBase64.length * 0.75) })), externalDomains: external, warnings, blocking: !all.length };
}
