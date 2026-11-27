// PDF and Office files on a chat turn become plain text before the attachment checks run. The file arrives as bytes,
// is written under a name this file chooses into a fresh temporary folder, and is read by pdftotext or unzip only:
// no office suite, so no macros and no linked content is ever fetched. The type comes from an allowlist and the first
// bytes must match it. Scanned pages have no text and are refused in plain words.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LIMITS, type Refusal } from "./attachments";

export const DOC_LIMITS = { file: 8 * 1024 * 1024, chars: 200_000, output: 4 * 1024 * 1024, parts: 120, timeoutMs: 20_000 };
const DOC = /\.(pdf|docx|odt|pptx|odp)$/i;

export type DocRefusal = Refusal | "no-reader" | "no-text";
type Result = { ok: true; raw: unknown } | { ok: false; why: DocRefusal; name: string };

/** The command's output up to the cap; null when the tool is missing. A tool that runs too long or says too much is stopped. */
async function run(cmd: string[]): Promise<{ ok: boolean; out: string } | null> {
  let p;
  try { p = Bun.spawn(cmd, { stdout: "pipe", stderr: "ignore" }); } catch { return null; }
  const timer = setTimeout(() => p.kill(9), DOC_LIMITS.timeoutMs);
  const chunks: Uint8Array[] = []; let size = 0, cut = false;
  try {
    for await (const c of p.stdout as unknown as AsyncIterable<Uint8Array>) {
      chunks.push(c); size += c.length;
      if (size >= DOC_LIMITS.output) { cut = true; p.kill(9); break; }
    }
    await p.exited;
  } finally { clearTimeout(timer); }
  return { ok: cut || p.exitCode === 0, out: Buffer.concat(chunks).toString("utf8") };
}

const ENTITY: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
/** The words of an Office XML part: paragraph and cell ends become line breaks, every other tag goes. */
export const xmlText = (xml: string): string => xml
  // no class here may cross a "<": otherwise a run of them makes each pattern rescan to the end, and a crafted file stalls the server
  .replace(/<\/(?:w|a|text):(?:p|h)>|<(?:w:br|text:line-break)[^<>]*\/>/g, "\n")
  .replace(/<(?:w:tab|text:tab)(?:\s[^<>]*)?\/>/g, "\t").replace(/<text:s(?:\s[^<>]*)?\/>/g, " ")
  .replace(/<[^<>]*>/g, "")
  .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (all, e: string) => {
    if (e[0] !== "#") return ENTITY[e] ?? all;
    const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1));
    return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : all;
  })
  .replace(/\n{3,}/g, "\n\n").trim();

async function extract(file: string, ext: string): Promise<{ text: string } | { why: "no-reader" | "bad-file" }> {
  if (ext === "pdf") {
    const r = await run(["pdftotext", "-layout", "-q", file, "-"]);
    return !r ? { why: "no-reader" } : r.ok ? { text: r.out } : { why: "bad-file" };
  }
  let parts = [ext === "docx" ? "word/document.xml" : "content.xml"];
  if (ext === "pptx") {
    const l = await run(["unzip", "-Z1", file]);
    if (!l) return { why: "no-reader" };
    const no = (s: string) => Number(/(\d+)\.xml$/.exec(s)![1]);
    parts = l.out.split("\n").filter((n) => /^ppt\/slides\/slide\d{1,4}\.xml$/.test(n)).sort((a, b) => no(a) - no(b)).slice(0, DOC_LIMITS.parts);
    if (!parts.length) return { why: "bad-file" };
  }
  const out: string[] = []; let size = 0;
  for (const [i, part] of parts.entries()) {
    const r = await run(["unzip", "-p", file, part]);
    if (!r) return { why: "no-reader" };
    if (!r.ok) return { why: "bad-file" };
    const t = xmlText(r.out);
    out.push(ext === "pptx" && t ? `Slide ${i + 1}\n${t}` : t); size += t.length;
    if (size >= DOC_LIMITS.chars) break;
  }
  return { text: out.filter(Boolean).join("\n\n") };
}

/** Turns every document in the request's attachment list into a text attachment under the same name. The rest is
 *  passed through untouched for readAttachments to judge. Refuses before running anything when the list is too long. */
export async function readDocuments(raw: unknown): Promise<Result> {
  if (!Array.isArray(raw) || raw.length > LIMITS.files) return { ok: true, raw };
  const out: unknown[] = []; let total = 0;
  for (const item of raw as Record<string, unknown>[]) {
    const name = typeof item?.name === "string" ? item.name.replace(/[\u0000-\u001f]/g, "").slice(0, 120) : "";
    const ext = DOC.exec(name)?.[1]?.toLowerCase(), data = typeof item?.data === "string" ? item.data : "";
    const mime = typeof item?.mime === "string" ? item.mime : "";
    if (!ext || mime.startsWith("text/")) { out.push(item); continue; }
    if (!data || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) return { ok: false, why: "bad-file", name };
    const bytes = Buffer.from(data, "base64");
    total += bytes.length;
    if (bytes.length > DOC_LIMITS.file) return { ok: false, why: "too-large", name };
    if (total > LIMITS.total) return { ok: false, why: "total-too-large", name };
    if (bytes.subarray(0, 4).toString("latin1") !== (ext === "pdf" ? "%PDF" : "PK\u0003\u0004")) return { ok: false, why: "bad-file", name };
    const dir = mkdtempSync(join(tmpdir(), "caesaros-doc-"));
    try {
      const file = join(dir, `in.${ext}`);
      writeFileSync(file, bytes, { mode: 0o600 });
      const got = await extract(file, ext);
      if ("why" in got) return { ok: false, why: got.why, name };
      let text = got.text.replace(/\u0000/g, "").replace(/\f/g, "\n").trim();
      if (!text) return { ok: false, why: "no-text", name };
      if (text.length > DOC_LIMITS.chars) text = `${text.slice(0, DOC_LIMITS.chars)}\n\n[The rest of this file was left out because it is too long.]`;
      out.push({ name, mime: "text/plain", data: text });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
  return { ok: true, raw: out };
}
