// Privacy: every address this app can reach, and why, built from what the person
// has set up. Nothing here is a log of traffic; it is the complete list of doors, plus who read private data.
import { useEffect, useState } from "react";
import { useStore } from "../store";

type Server = { id: string; name: string; url: string };
type Gateway = { id: string; name: string; url: string };
type Audit = { at: number; actor: string; subjectKind: string; subjectId: string; confidence: string; claim: string };

export function Privacy() {
  const { t, settings } = useStore();
  const [servers, setServers] = useState<Server[]>([]);
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [audit, setAudit] = useState<Audit[]>([]);
  useEffect(() => { void (async () => {
    setServers(await (await fetch("/api/model-servers")).json() as Server[]);
    const g = await (await fetch("/api/gateways")).json() as { gateways?: Gateway[] } | Gateway[];
    setGateways(Array.isArray(g) ? g : g.gateways ?? []);
    setAudit(await (await fetch("/api/audit")).json() as Audit[]);
  })(); }, []);

  const rows: { to: string; why: string }[] = [
    { to: "127.0.0.1:11434", why: t("privacy.why.ollama") },
    ...servers.map((s) => ({ to: s.url, why: t("privacy.why.server", { name: s.name }) })),
    ...gateways.map((g) => ({ to: g.url, why: t("privacy.why.gateway", { name: g.name }) })),
    ...(settings.brain.location === "remote" && settings.brain.url ? [{ to: settings.brain.url, why: t("privacy.why.brain") }] : []),
  ];
  return (
    <>
      <section className="panel frame"><div className="in">
        <h2 className="panel-title display">{t("privacy.title")}</h2>
        <p className="hint">{t("privacy.help")}</p>
        <ul className="rows">
          {rows.map((r) => (
            <li key={r.to} className="row-card frame"><div className="in"><div className="row-main"><div className="row-text">
              <h3 className="mono">{r.to}</h3><p className="small">{r.why}</p>
            </div></div></div></li>
          ))}
        </ul>
        <p className="hint small">{t("privacy.tools")}</p>
        <p className="hint small">{t("privacy.none")}</p>
      </div></section>
      <section className="panel frame"><div className="in">
        <h2 className="panel-title display">{t("privacy.reads")}</h2>
        {audit.length === 0 ? <p className="hint">{t("privacy.reads.none")}</p> : (
          <ul className="rows">
            {audit.slice(0, 20).map((a, i) => (
              <li key={i} className="row-card frame"><div className="in"><div className="row-main"><div className="row-text">
                <h3>{a.actor} · {a.subjectKind}</h3>
                <p className="mono small meta">{new Date(a.at).toLocaleString()} · {a.confidence}</p>
                <p className="small">{a.claim}</p>
              </div></div></div></li>
            ))}
          </ul>
        )}
      </div></section>
    </>
  );
}
