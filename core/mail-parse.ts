// One raw message to what the list and the reader need: headers and the text of the message. Only text is kept (no HTML, no attachments' bytes).
import { simpleParser, type AddressObject } from "mailparser";

export type Addr = { name: string; address: string };
export type Parsed = {
  messageId: string; inReplyTo: string; references: string[]; subject: string; from: Addr; to: Addr[]; cc: Addr[]; date: number;
  text: string; html: string; snippet: string; attachments: { index: number; filename: string; contentType: string; size: number; cid: string; inline: boolean }[];
};
const addrs = (a: AddressObject | AddressObject[] | undefined): Addr[] => (a ? ([] as AddressObject[]).concat(a) : []).flatMap((x) => x.value.map((v) => ({ name: v.name ?? "", address: (v.address ?? "").toLowerCase() })));
/** the words of an HTML mail: blocks become lines, tags, scripts, styles and addresses go */
const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
export function htmlToText(html: string): string {
  const spaced = html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ").replace(/<\/(p|div|h[1-6]|li|tr|table|blockquote)>|<br\s*\/?>/gi, "\n");
  // the result is shown as plain text only (escaped when drawn), so removing the tags is enough; nothing here is ever rendered as HTML
  return spaced.replace(/<[^>]*>/g, "").replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => ENT[e.toLowerCase()] ?? (e[0] === "#" ? String.fromCodePoint(Math.min(0x10ffff, e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) || 32) : m)).replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}
const flat = (s: string) => s.replace(/\s+/g, " ").trim();

export async function parseMessage(raw: Buffer | string): Promise<Parsed> {
  const m = await simpleParser(raw, { skipImageLinks: true });
  const html = typeof m.html === "string" ? m.html : "";
  // mailparser derives "text" from HTML mail and keeps link and image addresses in it; use it only when the sender wrote a text part
  const hasTextPart = /^content-type:\s*text\/plain/im.test(Buffer.isBuffer(raw) ? raw.toString("latin1") : raw);
  const text = hasTextPart || !html ? m.text ?? "" : htmlToText(html), body = text;
  const refs = typeof m.references === "string" ? [m.references] : m.references ?? [];
  return {
    messageId: m.messageId ?? "", inReplyTo: m.inReplyTo ?? "", references: refs, subject: m.subject ?? "", from: addrs(m.from)[0] ?? { name: "", address: "" }, to: addrs(m.to), cc: addrs(m.cc),
    date: m.date ? m.date.getTime() : 0, text, html, snippet: flat(body).slice(0, 180),
    attachments: (m.attachments ?? []).map((a, i) => ({ index: i, filename: a.filename ?? `attachment-${i + 1}`, contentType: a.contentType, size: a.size, cid: (a.cid ?? "").replace(/^<|>$/g, ""), inline: a.contentDisposition === "inline" || !!a.related })),
  };
}

/** a thread key shared by a message and its replies: the root message id, else the subject without Re: and Fwd: */
export function threadKey(p: Pick<Parsed, "messageId" | "inReplyTo" | "references" | "subject">): string {
  const root = p.references[0] || p.inReplyTo || p.messageId;
  if (root) return `m:${root}`;
  return `s:${p.subject.replace(/^(\s*(re|fwd?|odp|pd)\s*:\s*)+/i, "").trim().toLowerCase()}`;
}
