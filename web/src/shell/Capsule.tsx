// The system capsule (D3): live state, the engine chip, and Motion as an icon-only control that always
// carries its word. The chip opens in place; it never shifts the workspaces (R8).
import { useState } from "react";
import { createPortal } from "react-dom";
import { useStore } from "../store";
import { Icon } from "../ui/Icon";
import { ContributionStatusItems } from "./Contributions";

export function Capsule() {
  const { t, settings, update } = useStore();
  const [engineOpen, setEngineOpen] = useState(false);
  const motionOff = settings.motion === "off";
  const engineKey = settings.engine === "local" ? "engine.local" : settings.engine === "vps" ? "engine.vps" : "engine.offline";
  // "local" always means this device; only the remote route is named after a gateway the person added.
  const gatewayName = settings.engine === "vps" ? settings.gateways.find((g) => g.kind === "vps")?.name : undefined;

  return (
    <div className="capsule">
      <span className={`live ${settings.engine === "offline" ? "off" : ""}`} aria-hidden="true" />
      <div className="capsule-engine">
        <button
          className={`engine-chip ${settings.engine === "offline" ? "muted" : ""}`}
          aria-expanded={engineOpen} aria-haspopup="true"
          aria-label={`${t("capsule.engine")}: ${t(engineKey)}`}
          onClick={() => setEngineOpen(!engineOpen)}
          onPointerEnter={(e) => { if (e.pointerType === "mouse") setEngineOpen(true); }}
          onFocus={(e) => { if (e.currentTarget.matches(":focus-visible")) setEngineOpen(true); }}
          onPointerLeave={(e) => { if (e.pointerType === "mouse") setEngineOpen(false); }}
        >
          <Icon role="engine" size={16} />
          <span className="mono">{gatewayName ?? t(engineKey)}</span>
        </button>
        {engineOpen && createPortal((
          <div className="flyout capsule-panel" role="dialog" aria-label={t("capsule.engine")}>
            <div className="flyout-head"><span className="mono">{t("engine.routing")}</span>
              <button className="icon-btn sm" onClick={() => setEngineOpen(false)} aria-label={t("flyout.close")}><Icon role="close" size={18} /></button>
            </div>
            <div className="flyout-section">
              <div className="seg" role="tablist" aria-label={t("engine.routing")}>
                {(["local", "vps", "offline"] as const).map((e) => (
                  <button key={e} role="tab" aria-selected={settings.engine === e} className="seg-btn"
                    onClick={() => { void update({ engine: e }); setEngineOpen(false); }}>
                    {t(`settings.engine.${e}`)}
                  </button>
                ))}
              </div>
            </div>
            <div className="flyout-section">
              <h2 className="section-label mono">{t("settings.gateways")}</h2>
              {settings.gateways.length === 0
                ? <p className="empty-note small">{t("engine.no-gateway")}</p>
                : <ul>{settings.gateways.map((g) => (
                  <li key={g.id}><div className="row"><span className="row-icon"><Icon role="globe" size={18} /></span>
                    <span className="row-text"><span className="row-title">{g.name}</span><span className="row-sub mono">{g.kind}</span></span></div></li>
                ))}</ul>}
            </div>
          </div>
        ), document.body)}
      </div>
      <ContributionStatusItems />
      <button
        className={`capsule-item motion ${motionOff ? "off" : ""}`}
        aria-pressed={!motionOff}
        aria-label={motionOff ? t("capsule.motion.off.help") : t("capsule.motion.full.help")}
        title={motionOff ? t("capsule.motion.off.help") : t("capsule.motion.full.help")}
        onClick={() => void update({ motion: motionOff ? "full" : "off" })}
      >
        <Icon role="motion" size={18} />
        <span className="capsule-word mono">{motionOff ? t("capsule.motion.off") : t("capsule.motion.full")}</span>
      </button>
      <span className="capsule-sep" aria-hidden="true" />
      <span className="capsule-item alerts" aria-label={t("capsule.alerts.none")} title={t("capsule.alerts.none")}>
        <Icon role="clock" size={18} />
        <span className="mono">0</span>
      </span>
    </div>
  );
}
