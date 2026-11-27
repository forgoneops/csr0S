// Chat in the core: sessions and messages in the shared SQLite file, and one SSE stream per turn.
// The engine is whatever adapter the session names; this file knows no product.
import { running } from "./running";
import { Hono } from "hono";
import { db } from "./db";
import { getEngine, listEngines } from "./engines";
import { failoverStream } from "./failover";
import { scopeOf } from "./scope";
import { createThinkSplitter } from "./think-split";
import { search as searchKnowledge } from "./knowledge";
import { readAttachments, withTextFiles, type AttachmentMeta } from "./attachments";
import { readDocuments } from "./doc-text";
import { contextRoutes, dropSummary, sinceSummary, summaryNote } from "./chat-context";
import type { ChatMessage, ChatRole, EngineAdapter } from "./engines";
import type { ToolCall } from "./engines/types";

db.exec(`
  CREATE TABLE IF NOT EXISTS chat_sessions (
    id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '', engine TEXT NOT NULL, model TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY, session_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'complete', error TEXT, created_at INTEGER NOT NULL, seq INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS chat_messages_session_seq ON chat_messages (session_id, seq);
`);

// A conversation can be archived: out of the default list, still searchable and readable (older chats are kept for reference, the Brain holds what matters).
if (!db.query<{ name: string }, []>("PRAGMA table_info(chat_sessions)").all().some((c) => c.name === "archived")) db.exec("ALTER TABLE chat_sessions ADD COLUMN archived INTEGER NOT NULL DEFAULT 0");

if (!db.query<{ name: string }, []>("PRAGMA table_info(chat_sessions)").all().some((c) => c.name === "pinned")) db.exec("ALTER TABLE chat_sessions ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0");

// Reasoning is kept beside the answer, never inside it, so it can be shown folded and never fed back as the reply.
if (!db.query<{ name: string }, []>("PRAGMA table_info(chat_messages)").all().some((c) => c.name === "thinking")) db.exec("ALTER TABLE chat_messages ADD COLUMN thinking TEXT NOT NULL DEFAULT ''");

if (!db.query<{ name: string }, []>("PRAGMA table_info(chat_messages)").all().some((c) => c.name === "sources")) db.exec("ALTER TABLE chat_messages ADD COLUMN sources TEXT NOT NULL DEFAULT '[]'");
if (!db.query<{ name: string }, []>("PRAGMA table_info(chat_messages)").all().some((c) => c.name === "attachments")) db.exec("ALTER TABLE chat_messages ADD COLUMN attachments TEXT NOT NULL DEFAULT '[]'");
if (!db.query<{ name: string }, []>("PRAGMA table_info(chat_messages)").all().some((c) => c.name === "tools")) db.exec("ALTER TABLE chat_messages ADD COLUMN tools TEXT NOT NULL DEFAULT '[]'");

/** A passage from the person's own knowledge that the reply was given, numbered as the model cites it ([1], [2]). */
export type Source = { n: number; docId: string; name: string; passage: string };

export type ChatSession = { id: string; title: string; engine: string; model: string; createdAt: number; updatedAt: number; archived: boolean; pinned: boolean };
export type MessageStatus = "complete" | "error" | "stopped";
export type ChatMessageRow = { id: string; sessionId: string; role: ChatRole; content: string; status: MessageStatus; error: string | null; createdAt: number; thinking: string; tools: ToolCall[]; sources: Source[]; attachments: AttachmentMeta[] };

type SessionRecord = { id: string; title: string; engine: string; model: string; created_at: number; updated_at: number; archived: number; pinned: number };
type MessageRecord = { id: string; session_id: string; role: ChatRole; content: string; status: MessageStatus; error: string | null; created_at: number; seq: number; thinking: string; tools: string; sources: string; attachments: string };

const parseTools = (raw: string | null | undefined): ToolCall[] => { try { const v = JSON.parse(raw || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };
const clip = (v: string | undefined) => (v === undefined ? v : v.length > 4000 ? `${v.slice(0, 4000)}…` : v);

/** knowledge.ts wants every word to match, which a whole question never does: ask with its few longest words, then one by one. */
export function recall(question: string, limit = 5): { docId: string; name: string; passage: string }[] {
  const words = [...new Set(question.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? [])].sort((a, b) => b.length - a.length).slice(0, 4);
  if (!words.length) return [];
  const all = searchKnowledge(words.slice(0, 3).join(" "), limit);
  if (all.length) return all;
  const seen = new Set<string>();
  for (const w of words) for (const h of searchKnowledge(w, limit)) { const k = `${h.docId}:${h.passage}`; if (!seen.has(k) && seen.size < limit) { seen.add(k); all.push(h); } }
  return all;
}

const toSession = (r: SessionRecord): ChatSession => ({ id: r.id, title: r.title, engine: r.engine, model: r.model, createdAt: r.created_at, updatedAt: r.updated_at, archived: !!r.archived, pinned: !!r.pinned });
const toMessage = (r: MessageRecord): ChatMessageRow => ({ id: r.id, sessionId: r.session_id, role: r.role, content: r.content, status: r.status, error: r.error, createdAt: r.created_at, thinking: r.thinking ?? "", tools: parseTools(r.tools), sources: parseTools(r.sources) as unknown as Source[], attachments: parseTools(r.attachments) as unknown as AttachmentMeta[] });

const q = {
  sessions: db.query<SessionRecord, []>("SELECT * FROM chat_sessions ORDER BY updated_at DESC, created_at DESC"),
  session: db.query<SessionRecord, [string]>("SELECT * FROM chat_sessions WHERE id = ?"),
  insertSession: db.query("INSERT INTO chat_sessions (id, title, engine, model, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"),
  touch: db.query("UPDATE chat_sessions SET updated_at = ? WHERE id = ?"),
  setTitle: db.query("UPDATE chat_sessions SET title = ? WHERE id = ?"),
  setArchived: db.query("UPDATE chat_sessions SET archived = ? WHERE id = ?"),
  deleteMessages: db.query("DELETE FROM chat_messages WHERE session_id = ?"),
  deleteSession: db.query("DELETE FROM chat_sessions WHERE id = ?"),
  setPinned: db.query("UPDATE chat_sessions SET pinned = ? WHERE id = ?"),
  setModel: db.query("UPDATE chat_sessions SET model = ? WHERE id = ?"),
  messages: db.query<MessageRecord, [string]>("SELECT * FROM chat_messages WHERE session_id = ? ORDER BY seq"),
  nextSeq: db.query<{ n: number }, [string]>("SELECT COALESCE(MAX(seq), 0) + 1 AS n FROM chat_messages WHERE session_id = ?"),
  insertMessage: db.query("INSERT INTO chat_messages (id, session_id, role, content, status, error, created_at, seq, thinking, tools, sources, attachments) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"),
};

export function createSession(input: { title?: string; engine: string; model?: string }): ChatSession {
  const now = Date.now(), id = crypto.randomUUID();
  q.insertSession.run(id, input.title ?? "", input.engine, input.model ?? "", now, now);
  return toSession(q.session.get(id)!);
}

/** The default list leaves archived conversations out; `archived: true` lists only those. */
export function listSessions(archived = false): ChatSession[] { return q.sessions.all().map(toSession).filter((x) => x.archived === archived); }

export function getSession(id: string): { session: ChatSession; messages: ChatMessageRow[] } | null {
  const row = q.session.get(id);
  return row ? { session: toSession(row), messages: q.messages.all(id).map(toMessage) } : null;
}

/** The newest session per engine with its last answer: which engine ended how, and when (the orchestration view, plan 7.11). */
export function lastAnswerByEngine(): { id: string; engine: string; updatedAt: number; last: { status: MessageStatus; at: number; text: string; error: string | null } | null }[] {
  type R = { id: string; engine: string; updated_at: number; status: MessageStatus | null; at: number | null; content: string | null; error: string | null };
  const rows = db.query<R, []>(
    `SELECT s.id AS id, s.engine AS engine, s.updated_at AS updated_at, m.status AS status, m.created_at AS at, m.content AS content, m.error AS error
       FROM chat_sessions s LEFT JOIN chat_messages m ON m.session_id = s.id AND m.role = 'assistant'
        AND m.seq = (SELECT MAX(seq) FROM chat_messages WHERE session_id = s.id AND role = 'assistant')`).all();
  const newest = new Map<string, R>();
  for (const r of rows) { const seen = newest.get(r.engine); if (!seen || r.updated_at > seen.updated_at) newest.set(r.engine, r); }
  return [...newest.values()].map((r) => ({
    id: r.id, engine: r.engine, updatedAt: r.updated_at,
    last: r.status == null || r.at == null ? null : { status: r.status, at: r.at, text: r.content ?? "", error: r.error },
  }));
}

export function appendMessage(
  sessionId: string,
  m: { role: ChatRole; content: string; status?: MessageStatus; error?: string | null; id?: string; thinking?: string; tools?: ToolCall[]; sources?: Source[]; attachments?: AttachmentMeta[] },
): ChatMessageRow {
  const now = Date.now(), id = m.id ?? crypto.randomUUID();
  const seq = q.nextSeq.get(sessionId)!.n;
  q.insertMessage.run(id, sessionId, m.role, m.content, m.status ?? "complete", m.error ?? null, now, seq, m.thinking ?? "", JSON.stringify(m.tools ?? []), JSON.stringify(m.sources ?? []), JSON.stringify(m.attachments ?? []));
  q.touch.run(now, sessionId);
  return { id, sessionId, role: m.role, content: m.content, status: m.status ?? "complete", error: m.error ?? null, createdAt: now, thinking: m.thinking ?? "", tools: m.tools ?? [], sources: m.sources ?? [], attachments: m.attachments ?? [] };
}

/** What a later turn sends for a stored message; null when it is left out. */
const promptText = (m: ChatMessageRow): string | null => (m.status === "error" || m.content.trim() === "" ? null
  : withTextFiles(m.content, m.attachments) + m.attachments.filter((a) => a.kind === "image").map((a) => `\n[An image named ${a.name} was attached here.]`).join(""));

const sse = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const asText = (v: unknown) => (typeof v === "string" ? v : "");
const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e)) || "engine failed";

/** Turns in flight, by session: a second turn on the same thread would interleave two replies. */
const busy = new Set<string>();

async function probe<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; message: string }> {
  try { return { ok: true, value: await fn() }; } catch (e) { return { ok: false, message: messageOf(e) }; }
}

export function chatApi(localOnly: () => boolean = () => false): Hono {
  const api = new Hono();

  api.get("/sessions", (c) => c.json(listSessions(c.req.query("archived") === "1")));

  api.post("/sessions", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const engine = asText(body.engine).trim();
    if (!engine) return c.json({ error: "engine is required" }, 400);
    if (!getEngine(engine)) return c.json({ error: "unknown engine" }, 400);
    const session = createSession({ title: asText(body.title).trim().slice(0, 200), engine, model: asText(body.model).trim() });
    return c.json(session, 201);
  });

  api.get("/sessions/:id", (c) => {
    const found = getSession(c.req.param("id"));
    return found ? c.json(found) : c.json({ error: "no such session" }, 404);
  });

  api.patch("/sessions/:id", async (c) => {
    const id = c.req.param("id");
    if (!q.session.get(id)) return c.json({ error: "no such session" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    if (typeof body.archived === "boolean") q.setArchived.run(body.archived ? 1 : 0, id);
    if (typeof body.pinned === "boolean") q.setPinned.run(body.pinned ? 1 : 0, id);    // pinning does not move it in time
    const title = asText(body.title).trim().slice(0, 200);
    if (!title && typeof body.archived !== "boolean" && typeof body.pinned !== "boolean") return c.json({ error: "title is required" }, 400);
    if (title) q.setTitle.run(title, id);
    return c.json(toSession(q.session.get(id)!));
  });

  // A conversation that is still answering is not deleted under its own stream.
  api.delete("/sessions/:id", (c) => {
    const id = c.req.param("id");
    if (!q.session.get(id)) return c.json({ error: "no such session" }, 404);
    if (busy.has(id)) return c.json({ error: "busy", message: "this conversation is still answering" }, 409);
    db.transaction(() => { q.deleteMessages.run(id); q.deleteSession.run(id); dropSummary(id); })();
    return c.json({ ok: true });
  });

  contextRoutes(api, { get: getSession, textOf: promptText, busy, localOnly });

  api.post("/sessions/:id/turns", async (c) => {
    const found = getSession(c.req.param("id"));
    if (!found) return c.json({ error: "no such session" }, 404);
    const { session, messages: history } = found;
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const content = asText(body.content).trim();
    if (!content) return c.json({ error: "content is required" }, 400);

    // Everything that can refuse happens before anything is written.
    const adapter: EngineAdapter | undefined = getEngine(session.engine);
    if (!adapter) return c.json({ error: "engine-unavailable", message: `engine ${session.engine} is not installed in this build` }, 409);
    const lo = localOnly();
    const replaced = lo && scopeOf(adapter) === "cloud";           // Local only: this engine will not answer, a local one takes the turn
    const health = replaced ? { ok: true as const, value: { ok: true, detail: null } } : await probe(() => adapter.health());
    if (!health.ok || !health.value.ok) {
      const why = health.ok ? health.value.detail : health.message;
      return c.json({ error: "engine-unavailable", message: `${adapter.label} is not available${why ? `: ${why}` : ""}` }, 409);
    }
    let model = asText(body.model).trim() || session.model;
    if (!model && !replaced) {
      const listed = await probe(() => adapter.models());
      if (!listed.ok) return c.json({ error: "engine-unavailable", message: `${adapter.label} could not list its models: ${listed.message}` }, 409);
      model = listed.value[0]?.id ?? "";
    }
    if (!model && !replaced) return c.json({ error: "no-model", message: `${adapter.label} has no model to answer with` }, 409);

    const docs = await readDocuments(body.attachments);       // PDF and Office files become text first
    const files = docs.ok ? readAttachments(docs.raw) : docs;
    if (!files.ok) return c.json({ error: "attachment-refused", why: files.why, name: files.name }, files.why === "too-large" || files.why === "total-too-large" ? 413 : 400);
    const images = files.items.filter((f) => f.kind === "image");
    if (images.length && !replaced && !adapter.vision) return c.json({ error: "attachment-refused", why: "no-vision", message: `${adapter.label} cannot be handed images` }, 409);

    // Check and take the session in the same synchronous step: two turns must never interleave.
    if (busy.has(session.id)) return c.json({ error: "busy", message: "this conversation is still answering" }, 409);
    busy.add(session.id);
    const { summary, rest } = sinceSummary(session.id, history);     // a compacted part is sent as its summary
    const prior: ChatMessage[] = rest.flatMap((m) => { const t = promptText(m); return t === null ? [] : [{ role: m.role, content: t }]; });
    if (summary) prior.unshift({ role: "system", content: summaryNote(summary) });
    if (model !== session.model) q.setModel.run(model, session.id);
    // "Use my knowledge": the person's own passages ride along as a system note; the reply keeps them as numbered sources.
    const sources: Source[] = body.useKnowledge === true ? recall(content, 5).map((h, i) => ({ n: i + 1, docId: h.docId, name: h.name, passage: h.passage })) : [];
    if (sources.length) prior.unshift({ role: "system", content: `Passages from the person's own notes. Use them where they help and cite them as [1], [2]. If they do not help, say so and answer normally.\n\n${sources.map((x) => `[${x.n}] (${x.name}) ${x.passage}`).join("\n\n")}` });
    const metas: AttachmentMeta[] = files.items.map((f) => ({ name: f.name, kind: f.kind, mime: f.mime, size: f.size, ...(f.kind === "text" ? { text: f.data } : {}) }));
    const userMessage = appendMessage(session.id, { role: "user", content, attachments: metas });
    if (!session.title) q.setTitle.run(content.slice(0, 60), session.id);
    const assistantId = crypto.randomUUID();

    const ac = new AbortController();
    const onAbort = () => ac.abort();
    const request = c.req.raw.signal;
    request.addEventListener("abort", onAbort);
    running.add(`chat:${session.id}`, () => ac.abort()); // the live bar can stop it
    const enc = new TextEncoder();
    let closed = false;

    const body$ = new ReadableStream<Uint8Array>({
      start(controller) {
        const send = (event: string, data: unknown) => {
          if (closed || ac.signal.aborted) return;
          try { controller.enqueue(enc.encode(sse(event, data))); } catch { closed = true; }
        };
        void (async () => {
          let text = "", thought = "";
          const split = createThinkSplitter();
          const tools = new Map<string, ToolCall>(), began = new Map<string, number>();
          const tool = (c: ToolCall) => {
            if (!tools.has(c.id) && tools.size >= 50) return;            // a runaway loop cannot fill the row
            if (!began.has(c.id)) began.set(c.id, Date.now());
            const row: ToolCall = { ...tools.get(c.id), ...c, input: clip(c.input ?? tools.get(c.id)?.input), output: clip(c.output) };
            if ((c.status === "ok" || c.status === "error") && c.ms === undefined) row.ms = Date.now() - began.get(c.id)!;
            tools.set(c.id, row); send("tool", row);
          };
          const take = (r: { text: string; thinking: string }) => {
            if (r.thinking) { thought += r.thinking; send("thinking", { text: r.thinking }); }
            if (r.text) { text += r.text; send("delta", { text: r.text }); }
          };
          let status: MessageStatus = "complete";
          let error: string | null = null;
          send("meta", { sessionId: session.id, userMessage, assistantMessageId: assistantId, engine: replaced ? "" : adapter.id, model: replaced ? "" : model });
          if (body.useKnowledge === true) send("sources", sources);
          try {
            for await (const ev of failoverStream(adapter, listEngines(), [...prior, { role: "user", content: withTextFiles(content, metas), ...(images.length ? { images: images.map((i) => ({ mime: i.mime, data: i.data })) } : {}) }], { model, signal: ac.signal, localOnly: lo, ...(body.think === true ? { think: true } : {}), onSwitch: (sw) => { const to = getEngine(sw.to); send("switch", { from: sw.from, to: sw.to, reason: sw.reason, label: to?.label ?? sw.to, scope: to ? scopeOf(to) : "cloud", model: sw.model }); } })) {
              if (ac.signal.aborted) break;
              if (ev.type === "delta") take(split.push(ev.text));
              else if (ev.type === "tool") tool(ev.call);
              else if (ev.type === "thinking") { thought += ev.text; send("thinking", { text: ev.text }); }
              else break;
            }
            take(split.flush());
            if (ac.signal.aborted) status = "stopped";
          } catch (e) {
            if (ac.signal.aborted) status = "stopped";
            else { status = "error"; error = messageOf(e); }
          } finally {
            request.removeEventListener("abort", onAbort);
            // a call still open when the turn ends never finished: say so instead of leaving it "running" forever
            for (const [id, c] of tools) if (c.status === "running" || c.status === "waiting") tools.set(id, { ...c, status: "error", output: c.output ?? "Stopped before it finished." });
            let row: ChatMessageRow;
            try { row = appendMessage(session.id, { id: assistantId, role: "assistant", content: text, status, error, thinking: thought, tools: [...tools.values()], sources }); }
            catch { row = { id: assistantId, sessionId: session.id, role: "assistant", content: text, status, error: error ?? "could not save the reply", createdAt: Date.now(), thinking: thought, tools: [...tools.values()], sources, attachments: [] }; }
            busy.delete(session.id); running.remove(`chat:${session.id}`);
            if (status === "error") send("error", { message: error });
            send("done", { message: row, status });
            closed = true;
            try { controller.close(); } catch { /* the client already left */ }
          }
        })();
      },
      cancel() { closed = true; ac.abort(); },
    });

    return new Response(body$, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
    });
  });

  return api;
}
