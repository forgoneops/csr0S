// Models: what is installed with its size, a two-step delete, and the
// machine advice with downloads. Ollama owns the files; this page only lists and asks.
import { useCallback, useEffect, useState } from "react";
import { useStore } from "../store";
import { MachineCard } from "./Start";

type Installed = { name: string; sizeGb: number };

export function Models() {
  const { t } = useStore();
  const [list, setList] = useState<Installed[] | null>(null);
  const [sure, setSure] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  const load = useCallback(async () => setList(await (await fetch("/api/models/installed")).json() as Installed[]), []);
  useEffect(() => { void load(); }, [load]);
  const remove = async (name: string) => {
    const r = await fetch("/api/models/installed", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
    setErr(!r.ok); setSure(null); await load();
  };
  const total = (list ?? []).reduce((n, m) => n + m.sizeGb, 0);
  return (
    <>
      <section className="panel frame"><div className="in">
        <h2 className="panel-title display">{t("models.installed")}</h2>
        {!list ? <p className="hint">{t("devices.checking")}</p> : list.length === 0 ? <p className="hint">{t("models.none")}</p> : (
          <>
            <p className="mono small meta" role="status">{t("models.total", { n: list.length, gb: Math.round(total * 10) / 10 })}</p>
            <ul className="rows">
              {list.map((m) => (
                <li key={m.name} className="row-card frame"><div className="in"><div className="row-main">
                  <div className="row-text"><h3>{m.name}</h3><p className="mono small meta">{m.sizeGb} GB</p></div>
                  {sure === m.name
                    ? <><button className="btn btn-secondary" style={{ minHeight: 44 }} onClick={() => void remove(m.name)}>{t("models.confirm")}</button>
                        <button className="btn btn-quiet" style={{ minHeight: 44 }} onClick={() => setSure(null)}>{t("hw.cancel")}</button></>
                    : <button className="btn btn-quiet" style={{ minHeight: 44 }} onClick={() => setSure(m.name)}>{t("models.delete")}</button>}
                </div></div></li>
              ))}
            </ul>
          </>
        )}
        {err && <p className="mono small meta" role="alert">{t("models.fail")}</p>}
      </div></section>
      <section className="panel frame"><div className="in">
        <h2 className="panel-title display">{t("hw.title")}</h2>
        <MachineCard />
      </div></section>
    </>
  );
}
