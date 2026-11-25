// Knowledge base: add documents (paste or choose a text or Markdown file), search them, remove them.
// Everything stays on this machine; the index is the core's own full-text search.
import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { Icon } from "../ui/Icon";

type Doc = { id: string; name: string; chars: number; added: number };
type Hit = { docId: string; name: string; passage: string };

export function Knowledge() {
  const { t } = useStore();
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sure, setSure] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const load = useCallback(async () => setDocs(await (await fetch("/api/knowledge")).json() as Doc[]), []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!q.trim()) { setHits(null); return; }
    const id = setTimeout(async () => setHits(await (await fetch(`/api/knowledge/search?q=${encodeURIComponent(q)}`)).json() as Hit[]), 200);
    return () => clearTimeout(id);
  }, [q]);

  const add = async () => {
    setErr(null);
    const r = await fetch("/api/knowledge", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, text }) });
    if (!r.ok) { const j = await r.json() as { error?: string }; setErr(j.error === "too_large" ? t("kb.toolarge") : t("kb.fail")); return; }
    setName(""); setText(""); await load();
  };
  const pick = async (f: File | undefined) => { if (!f) return; setText(await f.text()); if (!name) setName(f.name.replace(/\.[^.]+$/, "")); };
  const remove = async (id: string) => { await fetch(`/api/knowledge/${id}`, { method: "DELETE" }); setSure(null); await load(); };

  return (
    <div className="page">
      <p className="lede">{t("kb.lede")}</p>
      <section className="panel frame"><div className="in">
        <h2 className="panel-title display">{t("kb.search")}</h2>
        <input className="text-input" value={q} placeholder={t("kb.search.ph")} aria-label={t("kb.search")} onChange={(e) => setQ(e.target.value)} />
        {hits && (hits.length === 0 ? <p className="hint">{t("kb.nohits")}</p> : (
          <ul className="rows">{hits.map((h, i) => (
            <li key={i} className="row-card frame"><div className="in"><div className="row-main"><div className="row-text"><h3>{h.name}</h3><p className="small">{h.passage}</p></div></div></div></li>
          ))}</ul>
        ))}
      </div></section>
      <section className="panel frame"><div className="in">
        <h2 className="panel-title display">{t("kb.add")}</h2>
        <div className="field-row"><label className="field-label mono" htmlFor="kb-name">{t("kb.name")}</label>
          <input id="kb-name" className="text-input" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="field-row"><label className="field-label mono" htmlFor="kb-text">{t("kb.text")}</label>
          <textarea id="kb-text" className="text-input" rows={6} value={text} onChange={(e) => setText(e.target.value)} style={{ height: "auto", padding: "var(--sp3)" }} /></div>
        <input ref={file} type="file" accept=".txt,.md,.markdown,text/plain,text/markdown" hidden onChange={(e) => void pick(e.target.files?.[0])} />
        <div style={{ display: "flex", gap: "var(--sp3)", flexWrap: "wrap" }}>
          <button className="btn btn-secondary" style={{ minHeight: 44, maxWidth: "100%", whiteSpace: "normal", height: "auto" }} onClick={() => file.current?.click()}><Icon role="add" size={15} /> {t("kb.file")}</button>
          <button className="btn btn-primary" style={{ minHeight: 44 }} disabled={!name.trim() || !text.trim()} onClick={() => void add()}>{t("kb.save")}</button>
        </div>
        {err && <p className="mono small meta" role="alert">{err}</p>}
        <p className="hint small">{t("kb.help")}</p>
      </div></section>
      <section className="panel frame"><div className="in">
        <h2 className="panel-title display">{t("kb.docs")}</h2>
        {docs && docs.length === 0 ? <p className="hint">{t("kb.none")}</p> : (
          <ul className="rows">{(docs ?? []).map((d) => (
            <li key={d.id} className="row-card frame"><div className="in"><div className="row-main">
              <div className="row-text"><h3>{d.name}</h3><p className="mono small meta">{d.chars < 1000 ? d.chars : `${Math.round(d.chars / 1000)} k`}</p></div>
              {sure === d.id
                ? <button className="btn btn-secondary" style={{ minHeight: 44 }} onClick={() => void remove(d.id)}>{t("models.confirm")}</button>
                : <button className="btn btn-quiet" style={{ minHeight: 44 }} onClick={() => setSure(d.id)}>{t("models.delete")}</button>}
            </div></div></li>
          ))}</ul>
        )}
      </div></section>
    </div>
  );
}
