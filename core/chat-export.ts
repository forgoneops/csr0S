// A conversation as markdown: saved as a new note, or handed back for a .md download. Message text is data:
// it goes into the file as written, and the file's name is built only from characters a note name allows.
// Operator only, like the notes it writes into.
import type { Hono } from "hono";
import { getSession, type ChatMessageRow, type ChatSession } from "./chat";
import { getEngine } from "./engines";
import { notes, validName } from "./notes";
import { access } from "./principal";

export const FOLDER = "Chats";
const MAX_NAME_BYTES = 160;   // leaves room under the 255-byte file name limit for the number, ".md" and the temp suffix

const day = (at: number) => { const d = new Date(at); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const oneLine = (s: string) => s.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ").trim();
const said = (m: ChatMessageRow) => (m.role === "user" || m.role === "assistant") && !!(m.content.trim() || m.attachments.length || m.error);

/** An unclosed code fence (a stopped reply) would swallow every message after it, so it is closed. */
function closeFences(text: string): string {
  let open = "";
  for (const line of text.split("\n")) {
    const m = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (!m) continue;
    if (!open) open = m[1]!;
    else if (m[1]![0] === open[0] && m[1]!.length >= open.length && !m[2]!.trim()) open = "";
  }
  return open ? `${text}\n${open}` : text;
}

export const titleOf = (session: ChatSession, messages: ChatMessageRow[]): string =>
  oneLine(session.title || messages.find((m) => m.role === "user" && m.content.trim())?.content.trim().split("\n")[0] || "").slice(0, 120) || "Conversation";

/** The conversation as markdown, or null when nothing was said. Reasoning and tool output stay out. */
export function toMarkdown(session: ChatSession, messages: ChatMessageRow[], speaker: string): string | null {
  const turns = messages.filter(said);
  if (!turns.length) return null;
  const parts = turns.map((m) => {
    const body = [closeFences(m.content.replace(/\r\n?/g, "\n").trim())];
    if (m.attachments.length) body.push(`Attached: ${m.attachments.map((a) => oneLine(a.name)).join(", ")}`);
    if (m.status === "stopped") body.push("_(stopped before the end)_");
    if (m.status === "error") body.push(`_(failed: ${oneLine(m.error ?? "no answer")})_`);
    return `## ${m.role === "user" ? "You" : oneLine(speaker)}\n\n${body.filter(Boolean).join("\n\n")}`;
  });
  return `# ${titleOf(session, messages)}\n\nConversation with ${oneLine(speaker)}, started ${day(session.createdAt)}.\n\n${parts.join("\n\n")}\n`;
}

/** One safe path segment: "<title> <date>", only what validName allows. */
export function baseName(title: string, at: number): string {
  const clean = title.normalize("NFC").replace(/[^\p{L}\p{N} _.()-]+/gu, " ").replace(/\.{2,}/g, ".").replace(/\s+/g, " ").replace(/^[^\p{L}\p{N}]+/u, "");
  let head = "";
  for (const ch of clean) { if (head.length >= 60 || Buffer.byteLength(head + ch) > MAX_NAME_BYTES) break; head += ch; }
  const name = `${head.replace(/[ .]+$/, "") || "Conversation"} ${day(at)}`;
  return validName(name) ? name : `Conversation ${day(at)}`;
}

/** Creates a new note and never touches an existing one: a taken name gets the next number. */
export function saveAsNote(store: Pick<typeof notes, "create">, base: string, markdown: string) {
  for (let n = 1; n <= 999; n++) {
    const r = store.create(`${FOLDER}/${n === 1 ? base : `${base} (${n})`}`, markdown);
    if (!("error" in r) || r.error !== "exists") return r;
  }
  return { error: "exists" as const };
}

export function chatExportRoutes(app: Hono, store: Pick<typeof notes, "create"> = notes): void {
  const load = (id: string) => {
    const found = getSession(id);
    if (!found) return { error: "not_found" as const, status: 404 as const };
    const { session, messages } = found;
    const markdown = toMarkdown(session, messages, getEngine(session.engine)?.label ?? session.engine);
    return markdown === null ? { error: "empty" as const, status: 409 as const } : { markdown, base: baseName(titleOf(session, messages), session.createdAt) };
  };
  app.use("/api/chat/sessions/:id/export/*", async (c, next) => (access.principal(c).kind === "operator" ? next() : c.json({ error: "operator_only" }, 403)));

  app.get("/api/chat/sessions/:id/export/markdown", (c) => {
    const r = load(c.req.param("id"));
    return "error" in r ? c.json({ error: r.error }, r.status) : c.json({ filename: `${r.base}.md`, markdown: r.markdown });
  });

  app.post("/api/chat/sessions/:id/export/note", (c) => {
    const r = load(c.req.param("id"));
    if ("error" in r) return c.json({ error: r.error }, r.status);
    try {
      const saved = saveAsNote(store, r.base, r.markdown);
      return "error" in saved ? c.json({ error: saved.error }, saved.error === "too_large" ? 413 : 409) : c.json({ id: saved.note.id }, 201);
    } catch { return c.json({ error: "write_failed" }, 500); }
  });
}
