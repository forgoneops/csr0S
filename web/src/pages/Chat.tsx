// Chat, the home surface. Honest by design: with no engine that answers and has a model there is nothing
// to send to, and the page says so instead of showing a dead conversation (R45). Sessions and messages live
// in the core; one SSE stream carries each reply, read here with fetch so Stop can really abort it.
import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useStore } from "../store";
import { Icon } from "../ui/Icon";
import { Select } from "../ui/Select";
import { Markdown } from "../ui/MarkdownView";
import { ApprovalsHost } from "./ApprovalsHost";
import { ThinkingBlock } from "./ThinkingBlock";
import { ToolRows, type ToolCall } from "./ToolRows";
import { Sources, type Source } from "./Sources";
import { AttachButton, AttachTray, SentFiles, useAttachments, type AttachmentMeta } from "./Attach";

type Model = { id: string; label: string };
type EngineInfo = { id: string; label: string; health: { ok: boolean; detail: string | null }; models: Model[] };
type Session = { id: string; title: string; engine: string; model: string; createdAt: number; updatedAt: number };
type Status = "complete" | "error" | "stopped" | "streaming";
type Msg = { id: string; role: "system" | "user" | "assistant"; content: string; status: Status; error?: string | null; thinking?: string; tools?: ToolCall[]; sources?: Source[]; attachments?: AttachmentMeta[] };
type Row = { id: string; role: Msg["role"]; content: string; status: Exclude<Status, "streaming">; error: string | null; thinking?: string; tools?: ToolCall[]; sources?: Source[]; attachments?: AttachmentMeta[] };

const json = { "content-type": "application/json", accept: "application/json" };

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json() as Promise<T>;
}

/** Server-sent events by hand: frames end at a blank line; each has an `event:` and `data:` line. */
async function readEvents(body: ReadableStream<Uint8Array>, on: (event: string, data: unknown) => void): Promise<void> {
  const reader = body.getReader(), dec = new TextDecoder();
  let buf = "";
  const frame = (raw: string) => {
    let event = "message"; const data: string[] = [];
    for (const l of raw.split("\n")) {
      if (l.startsWith("event:")) event = l.slice(6).trim();
      else if (l.startsWith("data:")) data.push(l.slice(5).replace(/^ /, ""));
    }
    if (!data.length) return;
    try { on(event, JSON.parse(data.join("\n"))); } catch { /* a frame that is not JSON is ignored */ }
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true }).replace(/\r\n/g, "\n");
    let at: number;
    while ((at = buf.indexOf("\n\n")) >= 0) { frame(buf.slice(0, at)); buf = buf.slice(at + 2); }
  }
}

export function Chat() {
  const { t, settings, go } = useStore();
  const [engines, setEngines] = useState<EngineInfo[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [model, setModel] = useState("");
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [sureDelete, setSureDelete] = useState<string | null>(null);
  const [find, setFind] = useState("");
  const [useKnowledge, setUseKnowledge] = useState(false);
  const att = useAttachments();
  const [drag, setDrag] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const turn = useRef(0);               // which send owns the thread on screen; a stale one never writes
  const log = useRef<HTMLDivElement | null>(null);

  const available = engines.filter((e) => e.health.ok && e.models.length > 0);
  const active = sessions.find((s) => s.id === activeId) ?? null;
  const shown = sessions.filter((s) => (s.title || t("chat.sessions.untitled")).toLowerCase().includes(find.trim().toLowerCase()));
  // An open conversation talks to the engine it was started with. If that one is down it is not silently swapped for another
  // (the screen would show a model the reply never used): the thread stays readable and sending is off until it answers.
  const forNew = available[0] ?? null;
  const engine = active ? (available.find((e) => e.id === active.engine) ?? null) : forNew;
  const threadDown = !!active && !engine;
  const models = engine?.models ?? [];
  const chosenModel = models.some((m) => m.id === model) ? model : (models[0]?.id ?? "");

  const refreshSessions = useCallback(async () => { setSessions(await getJson<Session[]>("/api/chat/sessions")); }, []);

  const load = useCallback(async () => {
    setLoadFailed(false);
    try {
      const [e, s] = await Promise.all([getJson<{ engines: EngineInfo[] }>("/api/engines"), getJson<Session[]>("/api/chat/sessions")]);
      setEngines(e.engines); setSessions(s);
      // Home hands over the conversation an approval belongs to
      const want = sessionStorage.getItem("caesar.openSession");
      if (want) { sessionStorage.removeItem("caesar.openSession"); if (s.some((x) => x.id === want)) void open(want); }
    } catch { setLoadFailed(true); }
    setLoaded(true);
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => () => { turn.current++; controller.current?.abort(); }, []);
  useEffect(() => { const el = log.current; if (el) el.scrollTop = el.scrollHeight; }, [messages]);

  const leaveTurn = () => { turn.current++; controller.current?.abort(); controller.current = null; setStreaming(false); };

  const open = async (id: string) => {
    leaveTurn(); setError(null); setActiveId(id);
    try {
      const got = await getJson<{ session: Session; messages: Row[] }>(`/api/chat/sessions/${id}`);
      setMessages(got.messages.map((m) => ({ id: m.id, role: m.role, content: m.content, status: m.status, error: m.error, thinking: m.thinking, tools: m.tools, sources: m.sources, attachments: m.attachments })));
      if (got.session.model) setModel(got.session.model);
    } catch { setError(t("chat.error.load")); }
  };

  const createSession = async (): Promise<Session | null> => {
    if (!forNew) return null;
    const r = await fetch("/api/chat/sessions", { method: "POST", headers: json, body: JSON.stringify({ engine: forNew.id, model: forNew.models.some((m) => m.id === chosenModel) ? chosenModel : (forNew.models[0]?.id ?? "") }) });
    if (!r.ok) throw new Error(`sessions: ${r.status}`);
    const s = await r.json() as Session;
    setSessions((cur) => [s, ...cur]);
    return s;
  };

  const saveTitle = async (id: string) => {
    const name = title.trim();
    setRenaming(null);
    if (!name) return;
    const r = await fetch(`/api/chat/sessions/${id}`, { method: "PATCH", headers: json, body: JSON.stringify({ title: name }) });
    if (r.ok) await refreshSessions(); else setError(t("chat.error.send"));
  };

  const removeSession = async (id: string) => {
    if (sureDelete !== id) { setSureDelete(id); setTimeout(() => setSureDelete((x) => (x === id ? null : x)), 4000); return; }
    setSureDelete(null);
    const r = await fetch(`/api/chat/sessions/${id}`, { method: "DELETE" });
    if (!r.ok) { setError(t(r.status === 409 ? "chat.error.busy" : "chat.error.send")); return; }
    if (id === activeId) { leaveTurn(); setActiveId(null); setMessages([]); }
    await refreshSessions();
  };

  const startNew = async () => {
    leaveTurn(); setError(null);
    try { const s = await createSession(); if (s) { setActiveId(s.id); setMessages([]); } } catch { setError(t("chat.error.send")); }
  };

  const reason = (code: string | undefined, body?: { why?: string; name?: string }) =>
    code === "attachment-refused" ? t(`attach.refused.${body?.why ?? "bad-file"}`, { name: body?.name ?? "" }) : code === "engine-unavailable" ? t("chat.error.unavailable") : code === "no-model" ? t("chat.error.no-model") : code === "busy" ? t("chat.error.busy") : t("chat.error.send");

  const send = async () => {
    const text = draft.trim();
    if (!text || streaming || !engine) return;
    const mine = ++turn.current;
    const own = () => turn.current === mine;
    const ac = new AbortController();
    controller.current = ac;
    setDraft(""); setError(null); setStreaming(true);

    const tempUser = `u-${mine}`, tempReply = `a-${mine}`;
    let replyId = tempReply;
    const patch = (id: string, fn: (m: Msg) => Msg) => setMessages((cur) => cur.map((m) => (m.id === id ? fn(m) : m)));
    const failBeforeStream = (message: string) => {
      setMessages((cur) => cur.filter((m) => m.id !== tempUser && m.id !== tempReply));
      setDraft(text); setError(message);
    };

    try {
      const session = active ?? await createSession();
      if (!session) throw new Error("no engine");
      if (!active) { setActiveId(session.id); setMessages([]); }
      const sentFiles = att.files.map(({ name, kind, mime, size }) => ({ name, kind, mime, size }));
      setMessages((cur) => [...cur, { id: tempUser, role: "user", content: text, status: "complete", attachments: sentFiles }, { id: tempReply, role: "assistant", content: "", status: "streaming" }]);

      const res = await fetch(`/api/chat/sessions/${session.id}/turns`, { method: "POST", headers: json, body: JSON.stringify({ content: text, model: chosenModel, useKnowledge, attachments: att.payload() }), signal: ac.signal });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({})) as { error?: string; why?: string; name?: string };
        if (own()) failBeforeStream(reason(body.error, body));
        return;
      }
      let finished = false;
      await readEvents(res.body, (event, data) => {
        if (!own()) return;
        const d = data as { userMessage?: Row; assistantMessageId?: string; text?: string; message?: Row & { error: string | null }; status?: Row["status"] };
        if (event === "meta" && d.userMessage && d.assistantMessageId) {
          const u = d.userMessage; replyId = d.assistantMessageId; att.clear();
          setMessages((cur) => cur.map((m) => (m.id === tempUser ? { id: u.id, role: u.role, content: u.content, status: "complete", attachments: u.attachments } : m.id === tempReply ? { ...m, id: replyId } : m)));
        } else if (event === "sources" && Array.isArray(data)) {
          patch(replyId, (m) => ({ ...m, sources: data as Source[] }));
        } else if (event === "tool" && (data as ToolCall).id) {
          const call = data as ToolCall;
          patch(replyId, (m) => { const cur = m.tools ?? []; return { ...m, tools: cur.some((x) => x.id === call.id) ? cur.map((x) => (x.id === call.id ? call : x)) : [...cur, call] }; });
        } else if (event === "thinking" && d.text) {
          const piece = d.text; patch(replyId, (m) => ({ ...m, thinking: (m.thinking ?? "") + piece }));
        } else if (event === "delta" && d.text) {
          const piece = d.text; patch(replyId, (m) => ({ ...m, content: m.content + piece }));
        } else if (event === "error") {
          const msg = (data as { message?: string }).message ?? "";
          patch(replyId, (m) => ({ ...m, status: "error", error: msg })); setError(`${t("chat.stream.error")} ${msg}`.trim());
        } else if (event === "done" && d.message) {
          finished = true; const f = d.message;
          patch(replyId, () => ({ id: f.id, role: f.role, content: f.content, status: f.status, error: f.error, thinking: f.thinking, tools: f.tools, sources: f.sources }));
        }
      });
      if (own() && !finished) patch(replyId, (m) => (m.status === "streaming" ? { ...m, status: "error", error: null } : m));
      if (own()) await refreshSessions().catch(() => {});
    } catch (e) {
      if (!own()) return;
      if (ac.signal.aborted || (e as Error).name === "AbortError") {
        patch(replyId, (m) => ({ ...m, status: "stopped" }));       // what already arrived stays
      } else if (replyId === tempReply) {
        failBeforeStream(t("chat.error.send"));                      // the stream never began: nothing worth keeping
      } else {
        patch(replyId, (m) => ({ ...m, status: "error", error: null })); setError(t("chat.error.send"));
      }
    } finally {
      if (own()) { controller.current = null; setStreaming(false); void refreshSessions().catch(() => {}); }
    }
  };

  const stop = () => { controller.current?.abort(); };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); }
  };

  const statusLabel = (m: Msg) =>
    m.status === "streaming" ? t("chat.status.streaming") : m.status === "stopped" ? t("chat.status.stopped") : m.status === "error" ? t("chat.status.error") : null;

  if (!loaded) return <div className="page chat-page"><p className="hint" role="status">{t("common.loading")}</p></div>;

  if (loadFailed) {
    return (
      <div className="page chat-page">
        <p className="chat-error" role="alert">{t("chat.error.load")}</p>
        <div className="row-actions"><button className="btn btn-secondary" onClick={() => { setLoaded(false); void load(); }}>{t("common.retry")}</button></div>
      </div>
    );
  }

  if (!forNew && !active) {
    return (
      <div className="page chat-page">
        <section className="hero-plate frame">
          <div className="in">
            <span className="mono kicker">{t("chat.subtitle")}</span>
            <h2 className="display">{t("chat.empty.title")}</h2>
            <p className="lede">{t("chat.empty.body")}</p>
            {engines.length > 0 ? (
              <ul className="engine-notes">
                {engines.map((e) => <li key={e.id} className="mono small">{e.label}{e.health.detail ? `: ${e.health.detail}` : ""}</li>)}
              </ul>
            ) : null}
            <div className="row-actions">
              <button className="btn btn-primary" onClick={() => go("/settings")}>
                <Icon role="settings" size={18} />
                {t("chat.empty.action")}
              </button>
            </div>
          </div>
        </section>

        <div className="composer">
          <label className="sr-only" htmlFor="chat-input">{t("chat.composer.placeholder")}</label>
          <textarea id="chat-input" className="field chat-input" rows={2} placeholder={t("chat.composer.placeholder")} value={draft}
            onChange={(e) => setDraft(e.target.value)} disabled aria-describedby="composer-note" />
          <button className="btn btn-secondary" disabled aria-describedby="composer-note">
            <Icon role="send" size={18} />
            {t("chat.send")}
          </button>
        </div>
        <p id="composer-note" className="hint">{t("chat.composer.disabled")}</p>
        <p className="hint small">{t("settings.engine")}: {t(`settings.engine.${settings.engine}`)}</p>
      </div>
    );
  }

  return (
    <div className="page chat-page">
      <div className="chat-shell">
        <aside className="chat-sessions" aria-label={t("chat.sessions.title")}>
          <div className="chat-sessions-head">
            <span className="mono section-label">{t("chat.sessions.title")}</span>
            <button className="btn btn-secondary" onClick={() => void startNew()}>
              <Icon role="add" size={18} />
              {t("chat.sessions.new")}
            </button>
          </div>
          {sessions.length > 0 && (
            <input className="field chat-find" type="search" value={find} onChange={(e) => setFind(e.target.value)}
              placeholder={t("chat.find")} aria-label={t("chat.find")} spellCheck={false} autoComplete="off" />
          )}
          {sessions.length === 0 ? <p className="empty-note">{t("chat.sessions.empty")}</p> : shown.length === 0 ? <p className="empty-note">{t("chat.find.none")}</p> : (
            <ul className="chat-session-list">
              {shown.map((s) => (
                <li key={s.id} className="chat-session-item">
                  {renaming === s.id ? (
                    <form className="chat-rename" onSubmit={(e) => { e.preventDefault(); void saveTitle(s.id); }}>
                      <label className="sr-only" htmlFor={`rn-${s.id}`}>{t("chat.rename")}</label>
                      <input id={`rn-${s.id}`} className="text-input" autoFocus value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") setRenaming(null); }} />
                      <button className="btn btn-primary" style={{ minHeight: 44 }} type="submit"><Icon role="check" size={15} /> {t("chat.rename.save")}</button>
                    </form>
                  ) : (
                    <>
                      <button className="chat-session row" aria-current={s.id === activeId ? "true" : undefined} onClick={() => void open(s.id)}>
                        <Icon role="chat" size={16} />
                        <span className="row-text">
                          <span className="row-title">{s.title || t("chat.sessions.untitled")}</span>
                          <span className="row-sub mono">{s.model || s.engine}</span>
                        </span>
                      </button>
                      <button className="btn btn-quiet chat-act" style={{ minHeight: 44, minWidth: 44 }} onClick={() => { setRenaming(s.id); setTitle(s.title); }} aria-label={`${t("chat.rename")}: ${s.title || t("chat.sessions.untitled")}`}><Icon role="edit" size={15} /></button>
                      <button className="btn btn-quiet chat-act" style={{ minHeight: 44, minWidth: 44 }} onClick={() => void removeSession(s.id)} aria-label={`${t("chat.delete")}: ${s.title || t("chat.sessions.untitled")}`}>
                        <Icon role="delete" size={15} />{sureDelete === s.id ? <span className="mono small">{t("devices.remove.sure")}</span> : null}
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className={`chat-thread ${drag ? "dragging" : ""}`} aria-label={t("chat.thread")}
          onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDrag(true); } }}
          onDragLeave={(e) => { if (e.currentTarget === e.target) setDrag(false); }}
          onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files.length && !threadDown && !streaming) void att.add(e.dataTransfer.files); }}>
          {models.length > 1 ? (
            <div className="chat-model">
              <label className="mono" htmlFor="chat-model">{t("chat.model")}</label>
<Select id="chat-model" label={t("chat.model")} value={chosenModel} options={models.map((m) => ({ id: m.id, label: m.label }))} onChange={setModel} disabled={streaming} />
            </div>
          ) : engine ? (
            <p className="chip chat-model-chip"><span className="mono">{engine.label} · {chosenModel}</span></p>
          ) : null}

          <div className="chat-log" ref={log} role="log" aria-live="polite" aria-relevant="additions text">
            {messages.length === 0 ? <p className="empty-note">{t("chat.thread.empty")}</p> : messages.map((m) => (
              <article key={m.id} className={`msg msg-${m.role} msg-${m.status}`}>
                <header className="msg-head">
                  <span className="mono">{m.role === "user" ? t("chat.role.user") : t("chat.role.assistant")}</span>
                  {statusLabel(m) ? <span className={`msg-status msg-status-${m.status}`}>{statusLabel(m)}</span> : null}
                </header>
                <div className="msg-body">
                  {m.role === "assistant" && m.thinking ? <ThinkingBlock text={m.thinking} live={m.status === "streaming" && !m.content} /> : null}
                  {m.role === "assistant" && m.tools?.length ? <ToolRows calls={m.tools} /> : null}
                  {m.role === "assistant" ? <Markdown text={m.content} /> : <><p>{m.content}</p>{m.attachments?.length ? <SentFiles items={m.attachments} /> : null}</>}
                  {m.role === "assistant" && m.sources?.length ? <Sources items={m.sources} /> : null}
                  {m.status === "streaming" ? <span className="caret" aria-hidden="true" /> : null}
                </div>
                {m.status === "error" && m.error ? <p className="chat-error small">{m.error}</p> : null}
              </article>
            ))}
            <ApprovalsHost sessionId={activeId} />
          </div>

          {error ? <p className="chat-error" role="alert">{error}</p> : null}
          {threadDown && <p id="thread-down" className="chat-error" role="alert">{t("chat.engine.down", { name: engines.find((e) => e.id === active!.engine)?.label ?? active!.engine })}</p>}

          <AttachTray files={att.files} problem={att.problem} onRemove={att.remove} />
          <div className="composer-tools">
            <AttachButton onPick={(l) => void att.add(l)} disabled={threadDown || streaming} />
            <button className={`btn btn-quiet tool-toggle ${useKnowledge ? "on" : ""}`} aria-pressed={useKnowledge} title={t("chat.knowledge.help")} onClick={() => setUseKnowledge((v) => !v)}>
              <Icon role="memory" size={16} /> {t("chat.knowledge")}
            </button>
          </div>
          <div className="composer chat-composer">
            <label className="sr-only" htmlFor="chat-input">{t("chat.composer.placeholder")}</label>
            <textarea id="chat-input" className="field chat-input" rows={2} placeholder={t("chat.composer.placeholder")} value={draft}
              onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey}
              onPaste={(e) => { const imgs = [...e.clipboardData.files].filter((f) => f.type.startsWith("image/")); if (imgs.length) { e.preventDefault(); void att.add(imgs); } }} disabled={threadDown} aria-describedby={threadDown ? "thread-down" : undefined} />
            {streaming ? (
              <button className="btn btn-secondary chat-act" onClick={stop}>
                <Icon role="pause" size={18} />
                {t("chat.stop")}
              </button>
            ) : (
              <button className="btn btn-primary chat-act" onClick={() => void send()} disabled={!draft.trim() || threadDown}>
                <Icon role="send" size={18} />
                {t("chat.send")}
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
