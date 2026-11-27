// Attachments on a chat turn: images and plain-text files, with limits, checked before anything is written.
// An image is passed to the engine for that turn only (its bytes are not stored; the message keeps the name and size).
// A text file is stored with the message, so later turns still see it. PDF and Office files are turned into text
// first (core/doc-text.ts); one that arrives here unread is refused.
export type Attachment = { name: string; kind: "image" | "text"; mime: string; size: number; data: string };
export type AttachmentMeta = { name: string; kind: "image" | "text"; mime: string; size: number; text?: string };

export const LIMITS = { files: 4, image: 8 * 1024 * 1024, text: 1024 * 1024, total: 16 * 1024 * 1024 };
const IMAGE = /^image\/(png|jpeg|webp|gif)$/;
const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|jsonl|yaml|yml|toml|xml|html|css|js|ts|tsx|jsx|py|rs|go|java|c|h|cpp|sh|sql|log|ini|conf)$/i;

export type Refusal = "too-many" | "too-large" | "total-too-large" | "unsupported" | "bad-file";

/** Reads the request's list. Returns the clean attachments or the first reason to refuse; never throws. */
export function readAttachments(raw: unknown): { ok: true; items: Attachment[] } | { ok: false; why: Refusal; name?: string } {
  if (raw === undefined || raw === null) return { ok: true, items: [] };
  if (!Array.isArray(raw)) return { ok: false, why: "bad-file" };
  if (raw.length > LIMITS.files) return { ok: false, why: "too-many" };
  const items: Attachment[] = [];
  let total = 0;
  for (const r of raw as Record<string, unknown>[]) {
    const name = typeof r?.name === "string" ? r.name.replace(/[\u0000-\u001f]/g, "").slice(0, 120) : "";
    const mime = typeof r?.mime === "string" ? r.mime.toLowerCase().slice(0, 80) : "";
    const data = typeof r?.data === "string" ? r.data : "";
    if (!name || !data) return { ok: false, why: "bad-file", name };
    if (IMAGE.test(mime)) {
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data)) return { ok: false, why: "bad-file", name };
      const size = Math.floor((data.length * 3) / 4) - (data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0);
      if (size > LIMITS.image) return { ok: false, why: "too-large", name };
      total += size; items.push({ name, kind: "image", mime, size, data });
    } else if (mime.startsWith("text/") || mime === "application/json" || TEXT_EXT.test(name)) {
      const size = new TextEncoder().encode(data).length;
      if (size > LIMITS.text) return { ok: false, why: "too-large", name };
      if (data.includes("\u0000")) return { ok: false, why: "unsupported", name };   // binary pretending to be text
      total += size; items.push({ name, kind: "text", mime: mime || "text/plain", size, data });
    } else return { ok: false, why: "unsupported", name };
    if (total > LIMITS.total) return { ok: false, why: "total-too-large" };
  }
  return { ok: true, items };
}

/** What the engine reads for a stored text file: the person's words, then each file fenced and named. */
export const withTextFiles = (content: string, metas: AttachmentMeta[]): string =>
  metas.filter((m) => m.kind === "text" && m.text !== undefined).reduce((acc, m) => `${acc}\n\n[Attached file: ${m.name}]\n\`\`\`\n${m.text}\n\`\`\``, content);
