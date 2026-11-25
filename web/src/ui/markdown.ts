// A small, safe markdown parser for chat replies. It produces a tree, never HTML: React escapes every text
// node, so raw HTML in a reply stays visible text. Links are http, https or mailto only.
// shortcut: no images and no same-character nesting such as ***x***, because every branch stays linear on hostile
// input. Tables (capped at 12 columns and 200 rows) and lists nested up to 4 levels are read from indentation.
export type Inline =
  | { t: "text"; v: string }
  | { t: "code"; v: string }
  | { t: "strong"; c: Inline[] }
  | { t: "em"; c: Inline[] }
  | { t: "a"; href: string; c: Inline[] };
export type Align = "l" | "c" | "r" | null;
export type Item = { c: Inline[]; sub: Block[] };
export type Block =
  | { t: "p"; c: Inline[] }
  | { t: "h"; level: number; c: Inline[] }
  | { t: "code"; lang: string; v: string }
  | { t: "ul" | "ol"; items: Item[] }
  | { t: "table"; head: Inline[][]; align: (Align)[]; rows: Inline[][][] }
  | { t: "quote"; c: Block[] }
  | { t: "hr" };

const SAFE_URL = /^(https?:\/\/[^\s<>"']+|mailto:[^\s<>"']+)$/i;
export const safeHref = (u: string): string | null => (SAFE_URL.test(u.trim()) ? u.trim() : null);

// One alternation, scanned left to right. Each branch is bounded by delimiters it cannot cross, so it stays linear.
const INLINE = /(`+)([^`]+?)\1|\[([^\]\n]{1,300})\]\(((?:[^()\s]|\([^()\s]*\)){1,2000})\)|\*\*([^*\n]+?)\*\*|__([^_\n]+?)__|\*([^*\s][^*\n]*?)\*|(?<![A-Za-z0-9_])_([^_\s][^_\n]*?)_(?![A-Za-z0-9_])/g;

export function parseInline(src: string, depth = 0): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  const push = (v: string) => { if (v) out.push({ t: "text", v }); };
  for (const m of src.matchAll(INLINE)) {
    push(src.slice(last, m.index));
    last = m.index! + m[0].length;
    const rec = (s: string) => (depth < 2 ? parseInline(s, depth + 1) : [{ t: "text", v: s } as Inline]);
    if (m[2] !== undefined) out.push({ t: "code", v: m[2] });
    else if (m[3] !== undefined) {
      const href = safeHref(m[4]);
      if (href) out.push({ t: "a", href, c: rec(m[3]) });
      else push(`${m[3]} (${m[4]})`);                     // an unsafe link is shown as text, never as a link
    } else if (m[5] !== undefined || m[6] !== undefined) out.push({ t: "strong", c: rec((m[5] ?? m[6])!) });
    else out.push({ t: "em", c: rec((m[7] ?? m[8])!) });
  }
  push(src.slice(last));
  return out;
}

const FENCE = /^\s{0,3}(`{3,}|~{3,})\s*([\w+-]*)\s*$/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const HR = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const UL = /^\s*[-*+]\s+(.*)$/;
const OL = /^\s*\d{1,9}[.)]\s+(.*)$/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;

const TABLE_SEP = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)+\|?\s*$/;
const cells = (l: string): string[] => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim()).slice(0, 12);

function readTable(lines: string[], at: number): { block: Block; next: number } {
  const head = cells(lines[at]).map((c) => parseInline(c));
  const align = cells(lines[at + 1]).map((c): Align => (c.startsWith(":") && c.endsWith(":") ? "c" : c.endsWith(":") ? "r" : c.startsWith(":") ? "l" : null));
  const rows: Inline[][][] = [];
  let i = at + 2;
  while (i < lines.length && lines[i].trim() && lines[i].includes("|") && rows.length < 200) rows.push(cells(lines[i++]).map((c) => parseInline(c)));
  return { block: { t: "table", head, align, rows }, next: i };
}

const indentOf = (l: string) => l.length - l.trimStart().length;

/** One list at one indent: deeper lines under an item become its sub-list (depth capped at 4 so hostile input stays linear). */
function readList(lines: string[], at: number, depth: number): { block: Block; next: number } {
  const base = indentOf(lines[at]);
  const kind = UL.test(lines[at]) ? UL : OL;
  const items: Item[] = [];
  let i = at;
  while (i < lines.length && kind.test(lines[i]) && indentOf(lines[i]) === base) {
    const item: Item = { c: parseInline(kind.exec(lines[i++])![1]), sub: [] };
    while (i < lines.length && (UL.test(lines[i]) || OL.test(lines[i])) && indentOf(lines[i]) > base) {
      if (depth >= 3) { item.c.push({ t: "text", v: "\n" + lines[i++].trim() }); continue; }
      const sub = readList(lines, i, depth + 1); item.sub.push(sub.block); i = sub.next;
    }
    items.push(item);
  }
  return { block: { t: kind === UL ? "ul" : "ol", items }, next: i };
}

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    const f = FENCE.exec(line);
    if (f) {                                              // an unclosed fence (a reply still streaming) runs to the end
      const body: string[] = [];
      i++;
      while (i < lines.length && !(lines[i].trim().startsWith(f[1]) && lines[i].trim().replace(new RegExp(`^${f[1][0]}+`), "") === "")) body.push(lines[i++]);
      i++;
      blocks.push({ t: "code", lang: f[2], v: body.join("\n") });
      continue;
    }
    const h = HEADING.exec(line);
    if (h) { blocks.push({ t: "h", level: h[1].length, c: parseInline(h[2]) }); i++; continue; }
    if (HR.test(line)) { blocks.push({ t: "hr" }); i++; continue; }

    if (QUOTE.test(line)) {
      const inner: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) inner.push(QUOTE.exec(lines[i++])![1]);
      blocks.push({ t: "quote", c: parseMarkdown(inner.join("\n")) });
      continue;
    }
    const table = TABLE_SEP.test(lines[i + 1] ?? "") && line.includes("|") ? readTable(lines, i) : null;
    if (table) { blocks.push(table.block); i = table.next; continue; }
    if (UL.test(line) || OL.test(line)) { const l = readList(lines, i, 0); blocks.push(l.block); i = l.next; continue; }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !FENCE.test(lines[i]) && !HEADING.test(lines[i]) && !HR.test(lines[i]) && !QUOTE.test(lines[i]) && !UL.test(lines[i]) && !OL.test(lines[i]) && !(TABLE_SEP.test(lines[i + 1] ?? "") && lines[i].includes("|"))) para.push(lines[i++]);
    blocks.push({ t: "p", c: parseInline(para.join("\n")) });
  }
  return blocks;
}
