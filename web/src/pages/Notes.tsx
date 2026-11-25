// Notes: your own markdown files. List and search on the left, editor on the right (one column on a phone).
// Autosave sends the revision it started from; if the note changed elsewhere the person chooses, nothing is overwritten silently.
import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { codeText } from "../i18n";
import { Icon } from "../ui/Icon";
import { Markdown } from "../ui/MarkdownView";

type Meta = { id: string; updatedAt: number; size: number; snippet: string };
type Note = { id: string; content: string; rev: string; updatedAt: number };
type Status = "saved" | "dirty" | "saving" | "conflict" | "error";
const json = { "content-type": "application/json" };

export function Notes() {
  const { t, lang } = useStore();
  const [list, setList] = useState<Meta[] | null>(null);
  const [q, setQ] = useState("");
  const [note, setNote] = useState<Note | null>(null);
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [status, setStatus] = useState<Status>("saved");
  const [theirs, setTheirs] = useState<Note | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sure, setSure] = useState(false);
  const [tags, setTags] = useState<{ tag: string; count: number }[]>([]);
  const [tag, setTag] = useState<string | null>(null);
  const [back, setBack] = useState<string[]>([]);
  const live = useRef({ note, text, status });
  live.current = { note, text, status };
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async (query = "") => {
    const url = tag ? `/api/notes?tag=${encodeURIComponent(tag)}` : query.trim().length >= 2 ? `/api/notes?q=${encodeURIComponent(query.trim())}` : "/api/notes";
    const r = await fetch(url);
    setList(r.ok ? (await r.json() as Meta[]) : []);
    const tr = await fetch("/api/notes/tags"); setTags(tr.ok ? await tr.json() as { tag: string; count: number }[] : []);
  }, [tag]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { const id = setTimeout(() => void refresh(q), 250); return () => clearTimeout(id); }, [q, refresh]);
  // Notes that link to the open one, read when it opens or is renamed.
  useEffect(() => { if (!note) { setBack([]); return; } void (async () => { const r = await fetch(`/api/notes/${encodeURIComponent(note.id)}/backlinks`); setBack(r.ok ? await r.json() as string[] : []); })(); }, [note?.id]);

  const save = useCallback(async () => {
    const { note: n, text: body } = live.current;
    if (!n) return;
    setStatus("saving");
    const r = await fetch(`/api/notes/${encodeURIComponent(n.id)}`, { method: "PUT", headers: json, body: JSON.stringify({ content: body, rev: n.rev }) });
    if (r.ok) {
      const saved = await r.json() as Note;
      setNote(saved);
      setStatus(live.current.text === body ? "saved" : "dirty");    // typing went on while saving: stay dirty, the next save follows
      void refresh(q);
    } else if (r.status === 409) {
      setTheirs(((await r.json()) as { current: Note }).current); setStatus("conflict");
    } else setStatus("error");
  }, [q, refresh]);

  // Autosave 700 ms after the last key; flush a pending change when leaving the page.
  useEffect(() => {
    if (status !== "dirty") return;
    timer.current = setTimeout(() => void save(), 700);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [text, status, save]);
  useEffect(() => () => {
    const { note: n, text: body, status: st } = live.current;
    if (n && st === "dirty") void fetch(`/api/notes/${encodeURIComponent(n.id)}`, { method: "PUT", headers: json, keepalive: true, body: JSON.stringify({ content: body, rev: n.rev }) });
  }, []);

  const flush = async () => { if (timer.current) clearTimeout(timer.current); if (live.current.status === "dirty") await save(); };

  const open = async (id: string) => {
    await flush();
    setErr(null); setSure(false); setTheirs(null);
    const r = await fetch(`/api/notes/${encodeURIComponent(id)}`);
    if (!r.ok) { setErr("not_found"); void refresh(q); return; }
    const n = await r.json() as Note;
    setNote(n); setText(n.content); setName(n.id); setStatus("saved"); setMode("edit");
  };

  const create = async () => {
    await flush(); setErr(null);
    const r = await fetch("/api/notes", { method: "POST", headers: json, body: "{}" });
    if (!r.ok) { setErr(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "error"); return; }
    const n = await r.json() as Note;
    setNote(n); setText(n.content); setName(n.id); setStatus("saved"); setMode("edit"); setTheirs(null);
    await refresh(q);
  };

  const rename = async () => {
    if (!note || name === note.id) return;
    await flush();
    const r = await fetch(`/api/notes/${encodeURIComponent(note.id)}`, { method: "PUT", headers: json, body: JSON.stringify({ rev: live.current.note!.rev, name, content: live.current.text }) });
    if (r.ok) { const n = await r.json() as Note; setNote(n); setName(n.id); setErr(null); await refresh(q); }
    else { setErr(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "error"); setName(note.id); }
  };

  const remove = async () => {
    if (!note) return;
    if (!sure) { setSure(true); setTimeout(() => setSure(false), 4000); return; }
    setSure(false);
    await fetch(`/api/notes/${encodeURIComponent(note.id)}`, { method: "DELETE" });
    setNote(null); setText(""); setStatus("saved"); await refresh(q);
  };

  const keepMine = () => { if (theirs) { setNote(theirs); setStatus("dirty"); setTheirs(null); } };           // next save is based on their revision, with my text
  const loadTheirs = () => { if (theirs) { setNote(theirs); setText(theirs.content); setStatus("saved"); setTheirs(null); } };

  const statusKey: Record<Status, string> = { saved: "notes.saved", dirty: "notes.unsaved", saving: "notes.saving", conflict: "notes.conflict", error: "notes.error" };

  return (
    <div className="page notes" data-view={note ? "editor" : "list"}>
      <aside className="notes-list" aria-label={t("notes.title")}>
        <div className="notes-tools">
          <label className="sr-only" htmlFor="notes-q">{t("notes.search")}</label>
          <input id="notes-q" className="text-input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("notes.search")} autoComplete="off" />
          <button className="btn btn-primary" style={{ minHeight: 44 }} onClick={() => void create()}><Icon role="add" size={15} /> {t("notes.new")}</button>
        </div>
        {tags.length > 0 && (
          <div className="tag-row" role="group" aria-label={t("notes.tags")}>
            {tag && <button className="chip" style={{ minHeight: 44 }} onClick={() => setTag(null)}>{t("notes.alltags")}</button>}
            {tags.slice(0, 24).map((x) => (
              <button key={x.tag} className="chip" style={{ minHeight: 44 }} aria-pressed={tag === x.tag} onClick={() => setTag(tag === x.tag ? null : x.tag)}>#{x.tag} <span className="mono small meta">{x.count}</span></button>
            ))}
          </div>
        )}
        {list === null ? <p className="hint">{t("devices.checking")}</p> : list.length === 0 ? <p className="empty-note">{q.trim().length >= 2 ? t("notes.none") : t("notes.empty")}</p> : (
          <ul className="notes-items">
            {list.map((m) => (
              <li key={m.id}>
                <button className="row notes-item" aria-current={note?.id === m.id ? "true" : undefined} onClick={() => void open(m.id)}>
                  <span className="row-text"><span className="row-title">{m.id}</span><span className="row-sub">{m.snippet}</span></span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <section className="notes-editor" aria-label={t("notes.editor")}>
        {!note ? <p className="empty-note">{t("notes.pick")}</p> : (
          <>
            <div className="notes-head">
              <button className="btn btn-quiet notes-back" style={{ minHeight: 44 }} onClick={() => void flush().then(() => setNote(null))} aria-label={t("notes.back")}><Icon role="chevron-right" size={15} /></button>
              <label className="sr-only" htmlFor="note-name">{t("notes.name")}</label>
              <input id="note-name" className="text-input notes-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} onBlur={() => void rename()} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
              <div className="seg" role="tablist" aria-label={t("notes.title")}>
                <button role="tab" className="seg-btn" aria-selected={mode === "edit"} onClick={() => setMode("edit")}>{t("notes.edit")}</button>
                <button role="tab" className="seg-btn" aria-selected={mode === "preview"} onClick={() => setMode("preview")}>{t("notes.preview")}</button>
              </div>
              <button className="btn btn-quiet" style={{ minHeight: 44 }} onClick={() => void remove()} aria-label={t("notes.delete")}><Icon role="delete" size={15} /> {sure ? t("devices.remove.sure") : t("notes.delete")}</button>
            </div>

            {err && <p className="hint" role="alert" style={{ color: "var(--danger)" }}>{codeText(lang, "notes.err", err, "notes.err.error")}</p>}
            {status === "conflict" && theirs && (
              <div className="notes-conflict frame" role="alert"><div className="in">
                <p>{t("notes.conflict.text")}</p>
                <div style={{ display: "flex", gap: "var(--sp3)", flexWrap: "wrap" }}>
                  <button className="btn btn-secondary" style={{ minHeight: 44 }} onClick={loadTheirs}>{t("notes.conflict.theirs")}</button>
                  <button className="btn btn-primary" style={{ minHeight: 44 }} onClick={keepMine}>{t("notes.conflict.mine")}</button>
                </div>
              </div></div>
            )}

            {mode === "edit"
              ? <textarea className="text-input notes-text" value={text} spellCheck onChange={(e) => { setText(e.target.value); if (status !== "conflict") setStatus("dirty"); }} aria-label={t("notes.editor")} />
              : <div className="notes-preview"><Markdown text={text} /></div>}
            <p className="mono small meta" role="status">{t(statusKey[status])}</p>
            {back.length > 0 && (
              <div className="backlinks"><h3 className="field-label mono">{t("notes.backlinks")}</h3>
                {back.map((b) => <button key={b} className="chip" style={{ minHeight: 44 }} onClick={() => void flush().then(() => open(b))}>{b}</button>)}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
