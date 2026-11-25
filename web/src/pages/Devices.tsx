// Devices (R44): This device plus the gateways the person added. Health is asked only when the page
// opens or the person presses Check; a probe goes only to a gateway on this list.
import { useCallback, useEffect, useState } from "react";
import { Pairing } from "./Pairing";
import { useStore } from "../store";
import { codeText } from "../i18n";
import { Icon } from "../ui/Icon";

type Health = { id: string; ok: boolean; status: number | null; latencyMs: number | null; version: string | null; error: string | null };
type State = Health | "checking";
type List = { thisDevice: { id: string; name: string; version: string }; gateways: { id: string; name: string; url: string; kind: "local" | "vps" }[] };

export function Devices() {
  const { t, lang, update } = useStore();
  const [list, setList] = useState<List | null>(null);
  const [health, setHealth] = useState<Record<string, State>>({});
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [sure, setSure] = useState<string | null>(null);

  const check = useCallback(async (id: string) => {
    const down: Health = { id, ok: false, status: null, latencyMs: null, version: null, error: "unreachable" };
    setHealth((h) => ({ ...h, [id]: "checking" }));
    let result: Health = down;
    try {
      const r = await fetch(`/api/gateways/${id}/health`);
      result = r.ok ? (await r.json() as Health) : { ...down, status: r.status };
    } catch { /* stays "unreachable" */ }
    setHealth((h) => ({ ...h, [id]: result }));
  }, []);

  const load = useCallback(async () => {
    const l = await (await fetch("/api/gateways")).json() as List;
    setList(l);
    for (const g of [l.thisDevice, ...l.gateways]) void check(g.id);
  }, [check]);
  useEffect(() => { void load(); }, [load]);

  const add = async () => {
    setErr(null);
    const r = await fetch("/api/gateways", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, url }) });
    if (!r.ok) { setErr(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "unreachable"); return; }
    setName(""); setUrl("");
    await update({});            // an empty patch returns the saved settings, so the shell sees the new entry
    await load();
  };

  const remove = async (id: string) => {
    if (sure !== id) { setSure(id); setTimeout(() => setSure((s) => (s === id ? null : s)), 4000); return; }
    setSure(null);
    await fetch(`/api/gateways/${id}`, { method: "DELETE" });
    await update({});
    await load();
  };

  const line = (id: string, version: string | null) => {
    const h = health[id];
    if (!h || h === "checking") return t("devices.checking");
    if (h.ok) return t("devices.ok", { ms: h.latencyMs ?? 0, v: h.version ?? version ?? "?" });
    return codeText(lang, "devices.err", h.error, "devices.err.unreachable");
  };
  const dot = (id: string) => { const h = health[id]; return !h || h === "checking" ? "wait" : h.ok ? "on" : "bad"; };

  if (!list) return <div className="page"><p className="lede">{t("devices.checking")}</p></div>;
  return (
    <div className="page">
      <p className="lede">{t("devices.subtitle")}</p>
      <Pairing />

      <ul className="rows" aria-label={t("devices.title")}>
        {[{ id: list.thisDevice.id, name: t("devices.this"), url: t("devices.this.where"), kind: "local" as const, version: list.thisDevice.version, own: true },
          ...list.gateways.map((g) => ({ ...g, version: null as string | null, own: false }))].map((g) => (
          <li key={g.id} className="row-card frame">
            <div className="in">
              <div className="row-main">
                <span className={`dot ${dot(g.id)}`} aria-hidden="true" />
                <div className="row-text">
                  <h3>{g.name} <span className="mono ver">{g.kind === "vps" ? t("devices.kind.remote") : t("devices.kind.local")}</span></h3>
                  <p className="mono small meta">{g.url}</p>
                  <p className="mono small meta" role="status">{line(g.id, g.version)}</p>
                </div>
              </div>
              <button className="btn btn-quiet" style={{ minHeight: 44 }} onClick={() => void check(g.id)}><Icon role="refresh" size={15} /> {t("devices.check")}</button>
              {!g.own && (
                <button className="btn btn-quiet" style={{ minHeight: 44 }} onClick={() => void remove(g.id)} aria-label={`${t("devices.remove")} ${g.name}`}>
                  <Icon role="delete" size={15} /> {sure === g.id ? t("devices.remove.sure") : t("devices.remove")}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <section className="panel frame">
        <div className="in">
          <h2 className="panel-title display">{t("devices.add")}</h2>
          <form className="add-gateway" onSubmit={(e) => { e.preventDefault(); void add(); }}>
            <div className="field-row">
              <label className="field-label mono" htmlFor="gw-name">{t("devices.name")}</label>
              <input id="gw-name" className="text-input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder={t("devices.name.ph")} autoComplete="off" />
            </div>
            <div className="field-row">
              <label className="field-label mono" htmlFor="gw-url">{t("devices.url")}</label>
              <input id="gw-url" className="text-input" value={url} inputMode="url" onChange={(e) => setUrl(e.target.value)} placeholder="https://" autoComplete="off" spellCheck={false} />
            </div>
            <button className="btn btn-primary" style={{ minHeight: 44 }} type="submit" disabled={!name.trim() || !url.trim()}><Icon role="add" size={15} /> {t("devices.add.button")}</button>
          </form>
          {err && <p className="hint" role="alert" style={{ color: "var(--danger)" }}>{codeText(lang, "devices.err", err, "devices.err.unreachable")}</p>}
          <p className="hint small">{t("devices.egress")}</p>
        </div>
      </section>
    </div>
  );
}
