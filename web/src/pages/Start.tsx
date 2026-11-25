// First run (R47): what this machine has, one model source, where the Brain lives. Every step is optional,
// nothing is installed or signed in for the person, and Skip always works. The vendor's own sign-in
// command is shown, never run.
import { useEffect, useState } from "react";
import { useStore } from "../store";
import { useTerminalPane } from "../terminal/state";
import { Icon } from "../ui/Icon";
import { ModelServers } from "./ModelServers";
import { Modules } from "./Modules";

export type Report = { id: string; label: string; found: boolean; probe: { ok: boolean; version: string | null; error: string | null }; signIn: string | null };
export type Detect = { engines: Report[]; modelSources: number; brain: { location: "local" | "remote"; url: string } };

/** The tools found on this machine, with their own status. Shown in first run and in Settings. */
export function DetectedTools({ d }: { d: Detect | null }) {
  const { t } = useStore();
  const term = useTerminalPane();
  if (!d) return <p className="hint">{t("devices.checking")}</p>;
  return (
    <ul className="rows">
      {d.engines.map((e) => (
        <li key={e.id} className="row-card frame"><div className="in"><div className="row-main">
          <span className={`dot ${e.probe.ok ? "on" : e.found ? "wait" : ""}`} aria-hidden="true" />
          <div className="row-text">
            <h3>{e.label}</h3>
            <p className="mono small meta" role="status">
              {e.probe.ok ? t("start.ready", { v: e.probe.version ?? "?" }) : e.found ? t("start.signin") : t("start.absent")}
            </p>
            {e.signIn && <p className="mono small meta">{t("start.run")} <code>{e.signIn}</code></p>}
            {e.signIn && <button className="btn btn-secondary" style={{ minHeight: 44 }} onClick={() => term.show("person")}>{t("start.openterm")}</button>}
          </div>
        </div></div></li>
      ))}
    </ul>
  );
}

type Hw = { machine: { ramGb: number; cores: number; freeDiskGb: number; gpu: string; os: string }; advice: { tier: "quick" | "balanced" | "max"; model: string; sizeGb: number; why: string }[] };

/** Machine profile and the three-tier model advice. Read-only: the command is shown, nothing is downloaded. */
export function MachineCard() {
  const { t } = useStore();
  const [h, setH] = useState<Hw | null>(null);
  const [pull, setPull] = useState<{ model: string; status: string; completed: number; total: number; done: boolean; error: string | null } | null>(null);
  const [ollama, setOllama] = useState(false);
  useEffect(() => { void (async () => setH(await (await fetch("/api/hardware")).json() as Hw))(); }, []);
  useEffect(() => { void (async () => { const e = await (await fetch("/api/engines")).json() as { engines: { id: string; health: { ok: boolean } }[] }; setOllama(!!e.engines.find((x) => x.id === "ollama")?.health.ok); })(); }, [pull?.done]);
  // Progress is polled only while a download is running.
  useEffect(() => {
    let live = true;
    const tick = async () => { const r = await (await fetch("/api/models/pull")).json() as typeof pull; if (live) setPull(r); return r; };
    void tick();
    const id = setInterval(async () => { const r = await tick(); if (r?.done) clearInterval(id); }, 1000);
    return () => { live = false; clearInterval(id); };
  }, [pull?.done === false ? "run" : "idle"]);
  const download = async (model: string) => { await fetch("/api/models/pull", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model }) }); setPull({ model, status: "starting", completed: 0, total: 0, done: false, error: null }); };
  if (!h) return <p className="hint">{t("devices.checking")}</p>;
  const m = h.machine;
  return (
    <>
      <p className="mono small meta" role="status">{t("hw.line", { ram: m.ramGb, cores: m.cores, disk: m.freeDiskGb, gpu: m.gpu })}</p>
      {h.advice.length === 0 ? <p className="hint">{t("hw.none")}</p> : (
        <ul className="rows">
          {h.advice.map((a) => (
            <li key={a.tier} className="row-card frame"><div className="in"><div className="row-main"><div className="row-text">
              <h3>{t(`hw.tier.${a.tier}`)} <span className="mono small meta">{a.model} · {a.sizeGb} GB</span></h3>
              <p className="small">{t(`hw.why.${a.tier}`)}</p>
              {pull?.model === a.model && !pull.done ? (
                <div role="status"><progress className="pull-bar" max={pull.total || undefined} value={pull.total ? pull.completed : undefined} aria-label={t("hw.downloading")} />
                  <p className="mono small meta">{t("hw.downloading")} {pull.total ? `${Math.round((pull.completed / pull.total) * 100)}%` : pull.status}</p>
                  <button className="btn btn-quiet" style={{ minHeight: 44 }} onClick={() => void fetch("/api/models/pull", { method: "DELETE" })}>{t("hw.cancel")}</button></div>
              ) : pull?.model === a.model && pull.done && !pull.error && pull.status !== "cancelled" ? (
                <p className="mono small meta" role="status">{t("hw.ready")}</p>
              ) : ollama ? (
                <button className="btn btn-secondary" style={{ minHeight: 44 }} disabled={!!pull && !pull.done} onClick={() => void download(a.model)}>{t("hw.download", { size: a.sizeGb })}</button>
              ) : (
                <p className="mono small meta">{t("hw.needollama")}</p>
              )}
              {pull?.model === a.model && pull.error && <p className="mono small meta" role="alert">{pull.error}</p>}
            </div></div></div></li>
          ))}
        </ul>
      )}
      <p className="hint small">{t("hw.help")}</p>
    </>
  );
}

export function Start() {
  const { t, settings, update, go } = useStore();
  const [d, setD] = useState<Detect | null>(null);
  const LAST = 8;
  const [step, setStepRaw] = useState(() => { try { return Math.min(LAST, Math.max(0, Number(localStorage.getItem("start.step") ?? 0) || 0)); } catch { return 0; } });
  const setStep = (n: number) => { setStepRaw(n); try { localStorage.setItem("start.step", String(n)); } catch { /* resumable is a convenience */ } };
  const [brainUrl, setBrainUrl] = useState(settings.brain.url);
  useEffect(() => { void (async () => setD(await (await fetch("/api/detect")).json() as Detect))(); }, []);

  const finish = async () => { await update({ setupDone: true }); go("/"); };
  const setBrain = (location: "local" | "remote") => update({ brain: { location, url: location === "local" ? "" : brainUrl } });

  return (
    <div className="page">
      <p className="lede">{t("start.subtitle")}</p>

      <section className="panel frame" hidden={step !== 0}><div className="in">
        <h2 className="panel-title display">{t("start.welcome")}</h2>
        <p className="hint">{t("start.welcome.help")}</p>
        <h3 className="field-label mono">{t("start.language")}</h3>
        <div className="seg" role="tablist" aria-label={t("a11y.language")}>
          <button role="tab" className="seg-btn" aria-selected={settings.language === "en"} onClick={() => void update({ language: "en" })}>English</button>
          <button role="tab" className="seg-btn" aria-selected={settings.language === "pl"} onClick={() => void update({ language: "pl" })}>Polski</button>
        </div>
      </div></section>

      <section className="panel frame" hidden={step !== 1}><div className="in">
        <h2 className="panel-title display">{t("start.where")}</h2>
        <p className="hint">{t("start.where.help")}</p>
        <div className="seg" role="tablist" aria-label={t("start.where")}>
          {(["local", "vps", "offline"] as const).map((e) => (
            <button key={e} role="tab" className="seg-btn" aria-selected={settings.engine === e} onClick={() => void update({ engine: e })}>{t(`settings.engine.${e}`)}</button>
          ))}
        </div>
      </div></section>

      <section className="panel frame" hidden={step !== 2}><div className="in">
        <h2 className="panel-title display">{t("hw.title")}</h2>
        <MachineCard />
        <h3 className="field-label mono">{t("start.model")}</h3>
        <p className="hint">{t("start.model.help")}</p>
        {d && <p className="mono small meta" role="status">{d.modelSources > 0 ? t("start.sources", { n: d.modelSources }) : t("start.sources.none")}</p>}
        <ModelServers />
      </div></section>

      <section className="panel frame" hidden={step !== 3}><div className="in">
        <h2 className="panel-title display">{t("start.brain")}</h2>
        <div className="seg" role="tablist" aria-label={t("start.brain")}>
          <button role="tab" className="seg-btn" aria-selected={settings.brain.location === "local"} onClick={() => void setBrain("local")}>{t("start.brain.local")}</button>
          <button role="tab" className="seg-btn" aria-selected={settings.brain.location === "remote"} onClick={() => void setBrain("remote")}>{t("start.brain.remote")}</button>
        </div>
        {settings.brain.location === "remote" && (
          <div className="field-row">
            <label className="field-label mono" htmlFor="brain-url">{t("devices.url")}</label>
            <input id="brain-url" className="text-input" value={brainUrl} inputMode="url" placeholder="https://" spellCheck={false}
              onChange={(e) => setBrainUrl(e.target.value)} onBlur={() => void update({ brain: { location: "remote", url: brainUrl } })} />
          </div>
        )}
        <p className="hint small">{t("start.brain.help")}</p>
      </div></section>

      <section className="panel frame" hidden={step !== 4}><div className="in">
        <h2 className="panel-title display">{t("start.connect")}</h2>
        <p className="hint">{t("start.connect.help")}</p>
        <button className="btn btn-secondary" style={{ minHeight: 44 }} onClick={() => go("/modules")}>{t("start.openmodules")}</button>
      </div></section>

      <section className="panel frame" hidden={step !== 5}><div className="in">
        <h2 className="panel-title display">{t("start.found")}</h2>
        <DetectedTools d={d} />
        <p className="hint small">{t("start.found.help")}</p>
      </div></section>

      <section className="panel frame" hidden={step !== 6}><div className="in">
        <h2 className="panel-title display">{t("start.apps")}</h2>
        <p className="hint">{t("start.apps.help")}</p>
        <Modules />
      </div></section>

      <section className="panel frame" hidden={step !== 7}><div className="in">
        <h2 className="panel-title display">{t("start.devices")}</h2>
        <p className="hint">{t("start.devices.help")}</p>
        <button className="btn btn-secondary" style={{ minHeight: 44 }} onClick={() => go("/devices")}>{t("start.opendevices")}</button>
      </div></section>

      <section className="panel frame" hidden={step !== 8}><div className="in">
        <h2 className="panel-title display">{t("start.done")}</h2>
        <ul className="rows">
          {[
            [t("start.language"), settings.language === "pl" ? "Polski" : "English"],
            [t("start.where"), t(`settings.engine.${settings.engine}`)],
            [t("start.model"), d ? String(d.modelSources) : "…"],
            [t("start.brain"), settings.brain.location === "local" ? t("start.brain.local") : t("start.brain.remote")],
            [t("start.found"), d ? d.engines.filter((e) => e.probe.ok).map((e) => e.label).join(", ") || "-" : "…"],
          ].map(([k, v]) => (
            <li key={k} className="row-card frame"><div className="in"><div className="row-main"><div className="row-text"><h3>{k}</h3><p className="mono small meta">{v}</p></div></div></div></li>
          ))}
        </ul>
        <p className="hint small">{t("start.ready.help")}</p>
      </div></section>

      <nav className="stepper" aria-label={t("start.steps")}>
        <ol className="step-dots">
          {Array.from({ length: LAST + 1 }, (_, i) => (
            <li key={i}><button className="step-dot" aria-current={i === step ? "step" : undefined} aria-label={t("start.stepn", { n: i + 1, total: LAST + 1 })} onClick={() => setStep(i)} /></li>
          ))}
        </ol>
        <div className="step-actions">
          {step > 0 && <button className="btn btn-secondary" style={{ minHeight: 44 }} onClick={() => setStep(step - 1)}>{t("start.back")}</button>}
          {step < LAST
            ? <button className="btn btn-primary" style={{ minHeight: 44 }} onClick={() => setStep(step + 1)}>{t("start.next")}</button>
            : <button className="btn btn-primary" style={{ minHeight: 44 }} onClick={() => { setStep(0); void finish(); }}><Icon role="check" size={15} /> {t("start.finish")}</button>}
          <button className="btn btn-quiet" style={{ minHeight: 44 }} onClick={() => { setStep(0); void finish(); }}>{t("start.skip")}</button>
        </div>
      </nav>
    </div>
  );
}
