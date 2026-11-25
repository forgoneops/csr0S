// Model servers (R47): any OpenAI-compatible address the person adds. Shown in first run and in Settings.
// Health comes from /api/engines, which asks each added server; nothing else is contacted.
import { useCallback, useEffect, useState } from "react";
import { useStore } from "../store";
import { codeText } from "../i18n";
import { Icon } from "../ui/Icon";

type Server = { id: string; name: string; url: string; hasKey: boolean };
type EngineInfo = { id: string; health: { ok: boolean; detail: string | null }; models: { id: string }[] };

export function ModelServers() {
  const { t, lang } = useStore();
  const [list, setList] = useState<Server[] | null>(null);
  const [engines, setEngines] = useState<EngineInfo[]>([]);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [key, setKey] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [newKey, setNewKey] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [sure, setSure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setList(await (await fetch("/api/model-servers")).json() as Server[]);
    setEngines(((await (await fetch("/api/engines")).json()) as { engines: EngineInfo[] }).engines);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const add = async () => {
    setErr(null); setBusy(true);
    try {
      const r = await fetch("/api/model-servers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, url, key }) });
      if (!r.ok) { setErr(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "unreachable"); return; }
      setName(""); setUrl(""); setKey(""); await load();
    } finally { setBusy(false); }
  };
  const remove = async (id: string) => {
    if (sure !== id) { setSure(id); setTimeout(() => setSure((s) => (s === id ? null : s)), 4000); return; }
    setSure(null); await fetch(`/api/model-servers/${id}`, { method: "DELETE" }); await load();
  };
  const saveKey = async (id: string, value: string) => {
    setErr(null);
    const r = await fetch(`/api/model-servers/${id}/key`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: value }) });
    if (!r.ok) { setErr(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "unreachable"); return; }
    setEditing(null); setNewKey(""); await load();
  };
  const state = (id: string) => {
    const e = engines.find((x) => x.id === `server-${id}`);
    if (!e) return { dot: "wait", text: t("devices.checking") };
    return e.health.ok ? { dot: "on", text: t("servers.ok", { n: e.models.length }) } : { dot: "bad", text: t("servers.down") };
  };

  if (!list) return <p className="hint">{t("devices.checking")}</p>;
  return (
    <div className="field-row">
      {list.length > 0 && (
        <ul className="rows" aria-label={t("servers.title")}>
          {list.map((s) => {
            const st = state(s.id);
            return (
              <li key={s.id} className="row-card frame">
                <div className="in">
                  <div className="row-main">
                    <span className={`dot ${st.dot}`} aria-hidden="true" />
                    <div className="row-text">
                      <h3>{s.name}</h3>
                      <p className="mono small meta">{s.url}</p>
                      <p className="mono small meta" role="status">{st.text} · {s.hasKey ? t("servers.key.saved") : t("servers.key.none")}</p>
                      {editing === s.id && (
                        <form className="chat-rename" onSubmit={(e) => { e.preventDefault(); void saveKey(s.id, newKey); }}>
                          <label className="sr-only" htmlFor={`k-${s.id}`}>{t("servers.key")}</label>
                          <input id={`k-${s.id}`} className="text-input" type="password" autoComplete="off" autoFocus spellCheck={false} value={newKey} placeholder={t("servers.key.ph")} onChange={(e) => setNewKey(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") { setEditing(null); setNewKey(""); } }} />
                          <button className="btn btn-primary" style={{ minHeight: 44 }} type="submit" disabled={!newKey}><Icon role="check" size={15} /> {t("chat.rename.save")}</button>
                        </form>
                      )}
                    </div>
                  </div>
                  <button className="btn btn-quiet" style={{ minHeight: 44 }} onClick={() => { setEditing(editing === s.id ? null : s.id); setNewKey(""); }} aria-label={`${t("servers.key.change")}: ${s.name}`}><Icon role="lock" size={15} /> {t("servers.key.change")}</button>
                  {s.hasKey && <button className="btn btn-quiet" style={{ minHeight: 44 }} onClick={() => void saveKey(s.id, "")} aria-label={`${t("servers.key.remove")}: ${s.name}`}>{t("servers.key.remove")}</button>}
                  <button className="btn btn-quiet" style={{ minHeight: 44 }} onClick={() => void remove(s.id)} aria-label={`${t("devices.remove")} ${s.name}`}>
                    <Icon role="delete" size={15} /> {sure === s.id ? t("devices.remove.sure") : t("devices.remove")}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <form className="add-gateway" onSubmit={(e) => { e.preventDefault(); void add(); }}>
        <div className="field-row">
          <label className="field-label mono" htmlFor="ms-name">{t("devices.name")}</label>
          <input id="ms-name" className="text-input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder={t("servers.name.ph")} autoComplete="off" />
        </div>
        <div className="field-row">
          <label className="field-label mono" htmlFor="ms-url">{t("devices.url")}</label>
          <input id="ms-url" className="text-input" value={url} inputMode="url" onChange={(e) => setUrl(e.target.value)} placeholder="http://localhost:1234" autoComplete="off" spellCheck={false} />
        </div>
        <div className="field-row">
          <label className="field-label mono" htmlFor="ms-key">{t("servers.key")}</label>
          <input id="ms-key" className="text-input" type="password" autoComplete="off" spellCheck={false} value={key} placeholder={t("servers.key.ph")} onChange={(e) => setKey(e.target.value)} />
        </div>
        <button className="btn btn-primary" style={{ minHeight: 44 }} type="submit" disabled={busy || !name.trim() || !url.trim()}><Icon role="add" size={15} /> {t("devices.add.button")}</button>
      </form>
      {err && <p className="hint" role="alert" style={{ color: "var(--danger)" }}>{codeText(lang, "devices.err", err, "devices.err.unreachable")}</p>}
      <p className="hint small">{t("servers.help")} {t("servers.help.key")}</p>
    </div>
  );
}
