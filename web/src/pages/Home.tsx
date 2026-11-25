// Home (the Atrium): a greeting over Caesar's art, "What now?" with the next useful things, and workspaces,
// named boards of widgets the person chooses. Widgets here are built in; modules add theirs through
// contributions later. Every action is a visible button (no hover-only), and the layout works the same on a phone.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useStore } from "../store";
import { Icon } from "../ui/Icon";
import { ApprovalCard, useApprovals } from "./ApprovalsHost";

type Eng = { id: string; label: string; health: { ok: boolean } };
type Note = { id: string; snippet: string };
type Pending = { id: string; title: string; detail?: string; sessionId?: string };
type Backup = { name: string; at: number };

type Data = { engines: Eng[]; notes: Note[]; pending: Pending[]; docs: number; backups: Backup[]; projects: number };

const get = async <T,>(url: string, fallback: T): Promise<T> => { try { const r = await fetch(url); return r.ok ? await r.json() as T : fallback; } catch { return fallback; } };

export const WIDGETS = ["engines", "notes", "knowledge", "backup", "projects", "approvals"] as const;

export function Home() {
  const { t, settings, update, go } = useStore();
  const [d, setD] = useState<Data | null>(null);
  const [edit, setEdit] = useState(false);
  const [adding, setAdding] = useState("");
  const load = useCallback(async () => {
    const [e, n, a, k, b, p] = await Promise.all([
      get<{ engines: Eng[] }>("/api/engines", { engines: [] }), get<Note[]>("/api/notes", []), get<{ pending: Pending[] }>("/api/approvals", { pending: [] }),
      get<unknown[]>("/api/knowledge", []), get<Backup[]>("/api/backup", []), get<unknown[]>("/api/projects", []),
    ]);
    setD({ engines: e.engines, notes: n, pending: a.pending, docs: k.length, backups: b, projects: p.length });
  }, []);
  useEffect(() => { void load(); const id = setInterval(() => void load(), 15000); return () => clearInterval(id); }, [load]);

  const ws = settings.workspaces.find((w) => w.id === settings.workspace) ?? settings.workspaces[0]!;
  const saveWs = (next: typeof settings.workspaces, active = settings.workspace) => update({ workspaces: next, workspace: active });
  const patchWs = (widgets: string[]) => saveWs(settings.workspaces.map((w) => (w.id === ws.id ? { ...w, widgets } : w)));
  const move = (i: number, by: -1 | 1) => { const w = [...ws.widgets]; const j = i + by; if (j < 0 || j >= w.length) return; [w[i], w[j]] = [w[j]!, w[i]!]; void patchWs(w); };
  const addWorkspace = () => {
    const name = adding.trim().slice(0, 40); if (!name) return;
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/^[^a-z]+/, "w") || "w";
    const uniq = settings.workspaces.some((w) => w.id === id) ? `${id}-${settings.workspaces.length + 1}` : id;
    setAdding(""); void saveWs([...settings.workspaces, { id: uniq.slice(0, 31), name, widgets: [] }], uniq.slice(0, 31));
  };
  const removeWorkspace = () => { if (settings.workspaces.length < 2) return; const rest = settings.workspaces.filter((w) => w.id !== ws.id); void saveWs(rest, rest[0]!.id); };

  const hour = new Date().getHours();
  const greet = t(hour < 5 ? "home.night" : hour < 12 ? "home.morning" : hour < 18 ? "home.afternoon" : "home.evening");
  const who = settings.profile.callMe.trim() || t("home.operator");
  const date = new Date().toLocaleDateString(settings.language === "pl" ? "pl-PL" : "en-GB", { weekday: "long", day: "numeric", month: "long" });

  const ap = useApprovals();
  const openChatFor = (a: { sessionId?: string }) => { if (a.sessionId) sessionStorage.setItem("caesar.openSession", a.sessionId); go("/chat"); };
  const next = useMemo(() => {
    if (!d) return [];
    const out: { key: string; text: string; label: string; go: string }[] = [];
    if (!d.engines.some((e) => e.health.ok)) out.push({ key: "engine", text: t("home.now.engine"), label: t("home.open"), go: "/settings/engine" });
    if (d.docs === 0) out.push({ key: "docs", text: t("home.now.docs"), label: t("home.open"), go: "/knowledge" });
    const last = d.backups[0]?.at ?? 0;
    if (Date.now() - last > 7 * 86400000) out.push({ key: "backup", text: t("home.now.backup"), label: t("home.open"), go: "/settings/backup" });
    if (d.notes.length === 0) out.push({ key: "notes", text: t("home.now.notes"), label: t("home.open"), go: "/notes" });
    return out;
  }, [d, t]);

  const card = (id: string) => {
    if (!d) return <p className="hint">{t("devices.checking")}</p>;
    switch (id) {
      case "engines": return (<><h3 className="widget-title display">{t("home.w.engines")}</h3>
        <ul className="rows">{d.engines.map((e) => <li key={e.id} className="row-card frame"><div className="in"><div className="row-main"><span className={`dot ${e.health.ok ? "on" : ""}`} aria-hidden="true" /><div className="row-text"><h3>{e.label}</h3><p className="mono small meta">{e.health.ok ? t("home.ready") : t("home.down")}</p></div></div></div></li>)}</ul>
        <button className="btn btn-quiet" style={{ minHeight: 44 }} onClick={() => go("/settings/engine")}>{t("home.open")}</button></>);
      case "notes": return (<><h3 className="widget-title display">{t("home.w.notes")}</h3>
        {d.notes.length === 0 ? <p className="hint">{t("notes.empty")}</p> : <ul className="rows">{d.notes.slice(0, 4).map((n) => <li key={n.id}><button className="row" style={{ minHeight: 44 }} onClick={() => go("/notes")}><span className="row-text"><span className="row-title">{n.id}</span><span className="row-sub">{n.snippet}</span></span></button></li>)}</ul>}
        <button className="btn btn-quiet" style={{ minHeight: 44 }} onClick={() => go("/notes")}>{t("home.open")}</button></>);
      case "knowledge": return (<><h3 className="widget-title display">{t("home.w.knowledge")}</h3><p className="mono small meta">{t("projects.ndocs", { n: d.docs })}</p>
        <button className="btn btn-quiet" style={{ minHeight: 44 }} onClick={() => go("/knowledge")}>{t("home.open")}</button></>);
      case "projects": return (<><h3 className="widget-title display">{t("nav.projects")}</h3><p className="mono small meta">{d.projects}</p>
        <button className="btn btn-quiet" style={{ minHeight: 44 }} onClick={() => go("/projects")}>{t("home.open")}</button></>);
      case "backup": return (<><h3 className="widget-title display">{t("backup.title")}</h3>
        <p className="mono small meta">{d.backups[0] ? new Date(d.backups[0].at).toLocaleString() : t("backup.none")}</p>
        <button className="btn btn-quiet" style={{ minHeight: 44 }} onClick={() => go("/settings/backup")}>{t("home.open")}</button></>);
      case "approvals": return (<><h3 className="widget-title display">{t("home.w.approvals")}</h3><HomeApprovals ap={ap} openChatFor={openChatFor} /></>);
      default: return null;
    }
  };
    const widgetName = (id: string) => t(id === "projects" ? "nav.projects" : id === "backup" ? "backup.title" : `home.w.${id}`);

  return (
    <div className="page home">
      <section className="hero frame"><div className="in">
        <p className="mono small meta">{date}</p>
        <h2 className="hero-greet display">{greet}</h2>
        <p className="hero-name display">{who}.</p>
      </div></section>

      <section className="panel frame" aria-labelledby="now-h"><div className="in">
        <h2 id="now-h" className="panel-title display">{t("home.now")}</h2>
        {next.length === 0 && ap.pending.length === 0 ? <p className="hint">{t("home.now.clear")}</p> : (
          <ul className="rows now-list">{ap.pending.slice(0, 3).map((a) => <ApprovalCard key={a.id} a={a} sessionId={null} busy={ap.busy === a.id} onAnswer={(dd) => void ap.answer(a, dd, null)} onOpen={() => openChatFor(a)} />)}{next.map((n) => (
            <li key={n.key} className="row-card frame"><div className="in"><div className="row-main"><div className="row-text"><p>{n.text}</p></div>
              <button className="btn btn-secondary" style={{ minHeight: 44 }} onClick={() => go(n.go)}>{n.label}</button></div></div></li>
          ))}</ul>
        )}
      </div></section>

      <nav className="ws-tabs" aria-label={t("home.workspaces")}>
        {settings.workspaces.map((w) => (
          <button key={w.id} className="ws-tab" aria-current={w.id === ws.id ? "page" : undefined} onClick={() => void update({ workspace: w.id })}>{w.name}</button>
        ))}
        <button className="btn btn-quiet" style={{ minHeight: 44 }} aria-pressed={edit} onClick={() => setEdit(!edit)}>{edit ? t("home.done") : t("home.edit")}</button>
      </nav>

      {edit && (
        <section className="panel frame"><div className="in">
          <div className="tag-row" role="group" aria-label={t("home.addwidget")}>
            {WIDGETS.filter((w) => !ws.widgets.includes(w)).map((w) => <button key={w} className="chip" style={{ minHeight: 44 }} onClick={() => void patchWs([...ws.widgets, w])}><Icon role="add" size={13} /> {widgetName(w)}</button>)}
          </div>
          <div className="field-row"><label className="field-label mono" htmlFor="ws-new">{t("home.newws")}</label>
            <input id="ws-new" className="text-input" value={adding} maxLength={40} onChange={(e) => setAdding(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addWorkspace(); }} />
            <button className="btn btn-secondary" style={{ minHeight: 44 }} disabled={!adding.trim() || settings.workspaces.length >= 12} onClick={addWorkspace}>{t("projects.create")}</button></div>
          {settings.workspaces.length > 1 && <button className="btn btn-quiet" style={{ minHeight: 44 }} onClick={removeWorkspace}>{t("home.rmws")}</button>}
        </div></section>
      )}

      {ws.widgets.length === 0 ? <p className="hint">{t("home.emptyws")}</p> : (
        <div className="widgets">
          {ws.widgets.map((id, i) => (
            <section key={id} className="panel frame widget"><div className="in">
              {card(id)}
              {edit && (
                <div className="widget-tools">
                  <button className="btn btn-quiet" style={{ minHeight: 44 }} disabled={i === 0} onClick={() => move(i, -1)} aria-label={t("home.up")}><Icon role="chevron-up" size={14} /></button>
                  <button className="btn btn-quiet" style={{ minHeight: 44 }} disabled={i === ws.widgets.length - 1} onClick={() => move(i, 1)} aria-label={t("home.down2")}><Icon role="chevron-down" size={14} /></button>
                  <button className="btn btn-quiet" style={{ minHeight: 44 }} onClick={() => void patchWs(ws.widgets.filter((x) => x !== id))}>{t("home.remove")}</button>
                </div>
              )}
            </div></section>
          ))}
        </div>
      )}
    </div>
  );
}

function HomeApprovals({ ap, openChatFor }: { ap: ReturnType<typeof useApprovals>; openChatFor: (a: { sessionId?: string }) => void }) {
  const { t } = useStore();
  const { pending, busy, problem, answer } = ap;
  if (pending.length === 0) return <p className="hint">{t("home.none")}</p>;
  return (<>
    <ul className="approvals-list">{pending.map((a) => (
      <ApprovalCard key={a.id} a={a} sessionId={null} busy={busy === a.id} onAnswer={(d) => void answer(a, d, null)}
        onOpen={() => openChatFor(a)} />
    ))}</ul>
    {problem ? <p className="chat-error small" role="alert">{problem}</p> : null}
  </>);
}
