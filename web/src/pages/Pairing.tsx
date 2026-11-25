// Devices, the trailer's scene 04 (own build): the Brain card, this device with two switches and a pairing code,
// and the paired list. A code is made here and typed on the other device; sync comes later and is not claimed.
import { useCallback, useEffect, useState } from "react";
import { useStore } from "../store";

type Dev = { id: string; name: string; at: number; lastSeen: number | null; role: "paired-with-me" | "i-joined"; url?: string };
type State = { visible: boolean; discover: boolean; devices: Dev[]; name: string; codeActive: boolean };
type Backup = { name: string; at: number; sizeMb: number };

const jsonH = { "content-type": "application/json" };

export function Pairing() {
  const { t, settings, go } = useStore();
  const [s, setS] = useState<State | null>(null);
  const [code, setCode] = useState<{ code: string; expiresAt: number } | null>(null);
  const [left, setLeft] = useState(0);
  const [backups, setBackups] = useState<Backup[]>([]);
  const [notes, setNotes] = useState(0);
  const [joinUrl, setJoinUrl] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [sure, setSure] = useState<string | null>(null);

  const load = useCallback(async () => {
    const p = await fetch("/api/pairing"); if (p.ok) setS(await p.json() as State);
    const b = await fetch("/api/backup"); setBackups(b.ok ? await b.json() as Backup[] : []);
    const n = await fetch("/api/notes"); setNotes(n.ok ? (await n.json() as unknown[]).length : 0);
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!code) return;
    const id = setInterval(() => { const l = Math.max(0, Math.round((code.expiresAt - Date.now()) / 1000)); setLeft(l); if (l === 0) { setCode(null); void load(); } }, 500);
    return () => clearInterval(id);
  }, [code, load]);

  const flip = async (key: "visible" | "discover") => {
    if (!s) return;
    const r = await fetch("/api/pairing", { method: "PUT", headers: jsonH, body: JSON.stringify({ [key]: !s[key] }) });
    if (r.ok) { if (key === "visible" && s.visible) setCode(null); await load(); }
  };
  const makeCode = async () => { setErr(null); const r = await fetch("/api/pairing/code", { method: "POST" }); if (r.ok) { const c = await r.json() as { code: string; expiresAt: number }; setCode(c); setLeft(300); } else setErr(t("pair.err.visible")); };
  const join = async () => {
    setErr(null);
    const r = await fetch("/api/pairing/join", { method: "POST", headers: jsonH, body: JSON.stringify({ url: joinUrl, code: joinCode }) });
    if (r.ok) { setJoinUrl(""); setJoinCode(""); await load(); return; }
    const j = await r.json() as { error?: string };
    setErr(j.error === "unreachable" ? t("pair.err.unreachable") : j.error === "bad_url" ? t("pair.err.url") : t("pair.err.refused"));
  };
  const unpair = async (id: string) => { await fetch(`/api/pairing/devices/${id}`, { method: "DELETE" }); setSure(null); await load(); };
  const ago = (ms: number | null) => { if (!ms) return "-"; const m = Math.round((Date.now() - ms) / 60000); return m < 1 ? t("pair.now") : m < 60 ? t("pair.min", { n: m }) : t("pair.hours", { n: Math.round(m / 60) }); };

  const last = backups[0];
  return (
    <>
      <section className="panel frame"><div className="in">
        <h2 className="panel-title display">{t("pair.brain")}</h2>
        <p className="small">{settings.brain.location === "remote" ? t("pair.brain.remote", { url: settings.brain.url }) : t("pair.brain.local")}</p>
        <p className="mono small meta">{last ? t("pair.brain.last", { when: ago(last.at), notes, mb: last.sizeMb }) : t("pair.brain.nobackup", { notes })}</p>
        <button className="btn btn-secondary" style={{ minHeight: 44 }} onClick={() => go("/settings/backup")}>{t("pair.brain.open")}</button>
      </div></section>

      <section className="panel frame"><div className="in">
        <h2 className="panel-title display">{t("pair.this")}</h2>
        <p className="mono small meta">{s?.name ?? "..."} · {t("devices.this")}</p>
        {s && (
          <div className="switch-row">
            <button role="switch" aria-checked={s.visible} className="switch" onClick={() => void flip("visible")}><span className="switch-knob" aria-hidden="true" />{t("pair.visible")}</button>
            <button role="switch" aria-checked={s.discover} className="switch" onClick={() => void flip("discover")}><span className="switch-knob" aria-hidden="true" />{t("pair.discover")}</button>
          </div>
        )}
        <p className="hint small">{t("pair.visible.help")}</p>
        {code ? (
          <p className="pair-code mono" role="status" aria-live="polite">{code.code.slice(0, 3)} {code.code.slice(3)} <span className="small meta">{t("pair.left", { s: left })}</span></p>
        ) : (
          <button className="btn btn-secondary" style={{ minHeight: 44 }} disabled={!s?.visible} onClick={() => void makeCode()}>{t("pair.makecode")}</button>
        )}
        {err && <p className="mono small meta" role="alert">{err}</p>}
      </div></section>

      <section className="panel frame"><div className="in">
        <h2 className="panel-title display">{t("pair.paired")}</h2>
        {s && s.devices.length === 0 ? <p className="hint">{t("pair.none")}</p> : (
          <ul className="rows">{(s?.devices ?? []).map((d) => (
            <li key={d.id} className="row-card frame"><div className="in"><div className="row-main">
              <div className="row-text"><h3>{d.name}</h3><p className="mono small meta">{d.role === "i-joined" ? t("pair.role.joined") : t("pair.role.with")} · {t("pair.seen", { when: ago(d.lastSeen) })}</p></div>
              {sure === d.id
                ? <button className="btn btn-secondary" style={{ minHeight: 44 }} onClick={() => void unpair(d.id)}>{t("pair.unpair.sure")}</button>
                : <button className="btn btn-quiet" style={{ minHeight: 44 }} onClick={() => setSure(d.id)}>{t("pair.unpair")}</button>}
            </div></div></li>
          ))}</ul>
        )}
        <h3 className="field-label mono">{t("pair.join")}</h3>
        <div className="field-row"><label className="field-label mono" htmlFor="j-url">{t("devices.url")}</label>
          <input id="j-url" className="text-input" inputMode="url" placeholder="http://100.x.y.z:4410" value={joinUrl} spellCheck={false} onChange={(e) => setJoinUrl(e.target.value)} /></div>
        <div className="field-row"><label className="field-label mono" htmlFor="j-code">{t("pair.code")}</label>
          <input id="j-code" className="text-input" inputMode="numeric" maxLength={7} placeholder="123 456" value={joinCode} onChange={(e) => setJoinCode(e.target.value.replace(/\D/g, ""))} /></div>
        <button className="btn btn-primary" style={{ minHeight: 44 }} disabled={!joinUrl.trim() || joinCode.length !== 6} onClick={() => void join()}>{t("pair.do")}</button>
        <p className="hint small">{t("pair.later")}</p>
      </div></section>
    </>
  );
}
