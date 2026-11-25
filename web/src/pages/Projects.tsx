// Projects: a place with its own instructions, a default engine and the documents it uses. A conversation
// started in a project (chat) reads these. Everything is stored in this install's database.
import { useCallback, useEffect, useState } from "react";
import { useStore } from "../store";
import { Select } from "../ui/Select";

type Project = { id: string; name: string; instructions: string; engine: string; model: string; docs: string[] };
type Doc = { id: string; name: string };
type Eng = { id: string; label: string; health: { ok: boolean } };

export function Projects() {
  const { t } = useStore();
  const [list, setList] = useState<Project[] | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [engines, setEngines] = useState<Eng[]>([]);
  const [open, setOpen] = useState<Project | null>(null);
  const [name, setName] = useState("");
  const [sure, setSure] = useState(false);
  const json = { "content-type": "application/json" };

  const load = useCallback(async () => {
    setList(await (await fetch("/api/projects")).json() as Project[]);
    setDocs(await (await fetch("/api/knowledge")).json() as Doc[]);
    setEngines(((await (await fetch("/api/engines")).json()) as { engines: Eng[] }).engines);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    const r = await fetch("/api/projects", { method: "POST", headers: json, body: JSON.stringify({ name }) });
    if (r.ok) { setName(""); const p = await r.json() as Project; await load(); setOpen(p); }
  };
  const patch = async (change: Partial<Project>) => {
    if (!open) return;
    const next = { ...open, ...change }; setOpen(next);
    await fetch(`/api/projects/${open.id}`, { method: "PUT", headers: json, body: JSON.stringify(change) });
  };
  const remove = async () => { if (!open) return; await fetch(`/api/projects/${open.id}`, { method: "DELETE" }); setOpen(null); setSure(false); await load(); };
  const engineOptions = [{ id: "", label: t("projects.anyengine") }, ...engines.map((e) => ({ id: e.id, label: e.label }))];

  if (open) return (
    <div className="page">
      <button className="btn btn-quiet" style={{ minHeight: 44 }} onClick={() => { setOpen(null); void load(); }}>{t("notes.back")}</button>
      <section className="panel frame"><div className="in">
        <h2 className="panel-title display">{open.name}</h2>
        <div className="field-row"><label className="field-label mono" htmlFor="p-name">{t("kb.name")}</label>
          <input id="p-name" className="text-input" value={open.name} maxLength={80} onChange={(e) => setOpen({ ...open, name: e.target.value })} onBlur={() => void patch({ name: open.name })} /></div>
        <div className="field-row"><label className="field-label mono" htmlFor="p-inst">{t("projects.instructions")}</label>
          <textarea id="p-inst" className="text-input" rows={6} value={open.instructions} onChange={(e) => setOpen({ ...open, instructions: e.target.value })} onBlur={() => void patch({ instructions: open.instructions })} style={{ height: "auto", padding: "var(--sp3)" }} />
          <p className="hint small">{t("projects.instructions.help")}</p></div>
        <div className="field-row"><span className="field-label mono">{t("projects.engine")}</span>
          <Select id="p-engine" label={t("projects.engine")} value={open.engine} options={engineOptions} onChange={(v) => void patch({ engine: v, model: "" })} /></div>
        <div className="field-row"><span className="field-label mono">{t("projects.docs")}</span>
          {docs.length === 0 ? <p className="hint">{t("projects.nodocs")}</p> : (
            <div className="tag-row" role="group" aria-label={t("projects.docs")}>
              {docs.map((d) => (
                <button key={d.id} className="chip" style={{ minHeight: 44 }} aria-pressed={open.docs.includes(d.id)}
                  onClick={() => void patch({ docs: open.docs.includes(d.id) ? open.docs.filter((x) => x !== d.id) : [...open.docs, d.id] })}>{d.name}</button>
              ))}
            </div>
          )}</div>
        {sure
          ? <button className="btn btn-secondary" style={{ minHeight: 44 }} onClick={() => void remove()}>{t("models.confirm")}</button>
          : <button className="btn btn-quiet" style={{ minHeight: 44 }} onClick={() => setSure(true)}>{t("models.delete")}</button>}
      </div></section>
    </div>
  );

  return (
    <div className="page">
      <p className="lede">{t("projects.lede")}</p>
      <section className="panel frame"><div className="in">
        <h2 className="panel-title display">{t("projects.new")}</h2>
        <div className="field-row"><label className="field-label mono" htmlFor="p-new">{t("kb.name")}</label>
          <input id="p-new" className="text-input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) void create(); }} /></div>
        <button className="btn btn-primary" style={{ minHeight: 44 }} disabled={!name.trim()} onClick={() => void create()}>{t("projects.create")}</button>
      </div></section>
      <section className="panel frame"><div className="in">
        <h2 className="panel-title display">{t("projects.title")}</h2>
        {list && list.length === 0 ? <p className="hint">{t("projects.none")}</p> : (
          <ul className="rows">{(list ?? []).map((p) => (
            <li key={p.id} className="row-card frame"><div className="in"><button className="row-main" style={{ minHeight: 44, width: "100%", textAlign: "left" }} onClick={() => setOpen(p)}>
              <div className="row-text"><h3>{p.name}</h3><p className="mono small meta">{p.engine || t("projects.anyengine")} · {t("projects.ndocs", { n: p.docs.length })}</p></div>
            </button></div></li>
          ))}</ul>
        )}
      </div></section>
    </div>
  );
}
