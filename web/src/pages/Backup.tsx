// Backup: make a copy of the settings, chats and keys, download it, delete it. Restore comes later.
import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "../store";

type Item = { name: string; sizeMb: number; at: number };

export function Backup() {
  const { t } = useStore();
  const [list, setList] = useState<Item[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  const [pending, setPending] = useState(false);
  const [badFile, setBadFile] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const load = useCallback(async () => {
    const r = await fetch("/api/backup"); setList(r.ok ? await r.json() as Item[] : []); setErr(!r.ok);
    const p = await fetch("/api/backup/restore"); setPending(p.ok ? (await p.json() as { pending: boolean }).pending : false);
  }, []);
  const stage = async (f: File | undefined) => { if (!f) return; setBadFile(false); const r = await fetch("/api/backup/restore", { method: "POST", body: f }); setBadFile(!r.ok); await load(); };
  const cancel = async () => { await fetch("/api/backup/restore", { method: "DELETE" }); await load(); };
  useEffect(() => { void load(); }, [load]);
  const make = async () => { setBusy(true); const r = await fetch("/api/backup", { method: "POST" }); setErr(!r.ok); setBusy(false); await load(); };
  const remove = async (n: string) => { await fetch(`/api/backup/${n}`, { method: "DELETE" }); setSure(null); await load(); };
  return (
    <section className="panel frame"><div className="in">
      <h2 className="panel-title display">{t("backup.title")}</h2>
      <p className="hint">{t("backup.help")}</p>
      <button className="btn btn-secondary" style={{ minHeight: 44 }} disabled={busy} onClick={() => void make()}>{busy ? t("backup.making") : t("backup.make")}</button>
      {err && <p className="mono small meta" role="alert">{t("backup.fail")}</p>}
      {list && list.length === 0 && !err && <p className="hint">{t("backup.none")}</p>}
      {list && list.length > 0 && (
        <ul className="rows">
          {list.map((b) => (
            <li key={b.name} className="row-card frame"><div className="in"><div className="row-main">
              <div className="row-text"><h3 className="mono">{new Date(b.at).toLocaleString()}</h3><p className="mono small meta">{b.sizeMb} MB</p></div>
              <a className="btn btn-secondary" style={{ minHeight: 44, display: "inline-flex", alignItems: "center" }} href={`/api/backup/${b.name}`} download>{t("backup.download")}</a>
              {sure === b.name
                ? <button className="btn btn-secondary" style={{ minHeight: 44 }} onClick={() => void remove(b.name)}>{t("models.confirm")}</button>
                : <button className="btn btn-quiet" style={{ minHeight: 44 }} onClick={() => setSure(b.name)}>{t("models.delete")}</button>}
            </div></div></li>
          ))}
        </ul>
      )}
      <input ref={file} type="file" accept=".db,application/octet-stream" hidden onChange={(e) => void stage(e.target.files?.[0])} />
      <button className="btn btn-secondary" style={{ minHeight: 44 }} onClick={() => file.current?.click()}>{t("backup.restore")}</button>
      {badFile && <p className="mono small meta" role="alert">{t("backup.bad")}</p>}
      {pending && (
        <p className="mono small meta" role="status">{t("backup.pending")} <button className="btn btn-quiet" style={{ minHeight: 44 }} onClick={() => void cancel()}>{t("hw.cancel")}</button></p>
      )}
      <p className="hint small">{t("backup.warn")}</p>
    </div></section>
  );
}
