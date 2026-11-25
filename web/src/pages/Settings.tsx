// Settings: sections with their own address (/settings/<section>, R1), a section list beside the content, and every
// setting live. Everything here is a setting, and every pack swap needs no rebuild (R46, R52).
import { useEffect, useState } from "react";
import { useStore } from "../store";
import { Icon } from "../ui/Icon";
import { useInstall } from "../pwa";
import { ModelServers } from "./ModelServers";
import { Models } from "./Models";
import { GatewayKeys } from "./GatewayKeys";
import { Privacy } from "./Privacy";
import { Backup } from "./Backup";
import { ReportProblem } from "./ReportProblem";
import { DetectedTools, type Detect } from "./Start";
import { ContributionSettingsRows } from "../shell/Contributions";
import { SETTINGS_SECTIONS, sectionOf } from "../shell/screens";

export function SettingsPage() {
  const [detected, setDetected] = useState<Detect | null>(null);
  useEffect(() => { void (async () => setDetected(await (await fetch("/api/detect")).json() as Detect))(); }, []);
  const { t, settings, update, packs, go, modules, route } = useStore();
  const engineKeys = ["local", "vps", "offline"] as const;
  const install = useInstall();
  const section = sectionOf(route);

  return (
    <div className="page settings-page">
      <p className="lede">{t("settings.subtitle")}</p>
      <div className="settings-layout">
        <nav className="settings-nav" aria-label={t("settings.sections")}>
          {SETTINGS_SECTIONS.map((s) => (
            <button key={s.id} className="row" aria-current={section === s.id ? "page" : undefined} onClick={() => go(`/settings/${s.id}`)}>
              <span className="row-icon"><Icon role={s.icon} size={18} /></span>
              <span className="row-text"><span className="row-title">{t(`settings.section.${s.id}`)}</span></span>
            </button>
          ))}
        </nav>
        <div className="settings-body">
      {section === "appearance" && (
      <section className="panel frame">
        <div className="in">
          <h2 className="panel-title display">{t("settings.appearance")}</h2>
          <div className="field-row">
            <span className="field-label mono">{t("settings.theme")}</span>
            <div className="seg" role="tablist" aria-label={t("settings.theme")}>
              {packs.themes.map((p) => (
                <button key={p.id} role="tab" className="seg-btn" aria-selected={settings.theme === p.id} onClick={() => void update({ theme: p.id })}>
                  {p.name}
                </button>
              ))}
            </div>
            <p className="hint small">{t("settings.theme.help")}</p>
            {(packs.themes.find((p) => p.id === settings.theme)?.palettes.length ?? 0) > 0 && (
              <div className="seg palettes" role="radiogroup" aria-label={t("settings.palette")}>
                {packs.themes.find((p) => p.id === settings.theme)!.palettes.map((p, i) => {
                  const on = (settings.palette || packs.themes.find((x) => x.id === settings.theme)!.palettes[0].id) === p.id;
                  return (
                    <button key={p.id} role="radio" aria-checked={on} className="seg-btn swatch" title={p.name} aria-label={p.name}
                      style={{ "--sw1": p.p1, "--sw2": p.p2 } as React.CSSProperties} onClick={() => void update({ palette: p.id })}>
                      <span className="sw" aria-hidden="true" /><span className="sr-only">{i + 1}. {p.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="field-row">
            <span className="field-label mono">{t("settings.language")}</span>
            <div className="seg" role="tablist" aria-label={t("a11y.language")}>
              <button role="tab" className="seg-btn" aria-selected={settings.language === "en"} onClick={() => void update({ language: "en" })}>{t("common.english")}</button>
              <button role="tab" className="seg-btn" aria-selected={settings.language === "pl"} onClick={() => void update({ language: "pl" })}>{t("common.polish")}</button>
            </div>
            <p className="hint small">{t("settings.language.help")}</p>
          </div>

          <div className="field-row">
            <span className="field-label mono">{t("settings.motion")}</span>
            <div className="seg" role="tablist" aria-label={t("settings.motion")}>
              <button role="tab" className="seg-btn" aria-selected={settings.motion === "full"} onClick={() => void update({ motion: "full" })}>
                <Icon role="play" size={15} /> {t("capsule.motion.full")}
              </button>
              <button role="tab" className="seg-btn" aria-selected={settings.motion === "off"} onClick={() => void update({ motion: "off" })}>
                <Icon role="pause" size={15} /> {t("capsule.motion.off")}
              </button>
            </div>
            <p className="hint small">{t("settings.motion.help")}</p>
          </div>

          <div className="field-row">
            <label className="field-label mono" htmlFor="text-scale">{t("settings.textScale")} · {Math.round(settings.textScale * 100)}%</label>
            <input id="text-scale" className="slider" type="range" min={0.85} max={1.4} step={0.05} value={settings.textScale}
              onChange={(e) => void update({ textScale: Number(e.target.value) })} />
          </div>
        </div>
      </section>
      )}

      {section === "engine" && (
      <section className="panel frame">
        <div className="in">
          <h2 className="panel-title display">{t("settings.engine")}</h2>
          <div className="field-row">
            <span className="field-label mono">{t("settings.tools")}</span>
            <DetectedTools d={detected} />
            <p className="hint small">{t("settings.tools.help")}</p>
          </div>

          <div className="field-row">
            <span className="field-label mono">{t("gw.title")}</span>
            <GatewayKeys />
          </div>

          <div className="field-row">
            <span className="field-label mono">{t("settings.servers")}</span>
            <ModelServers />
          </div>

          <p className="hint small">{t("settings.engine.help")}</p>
          <div className="seg" role="tablist" aria-label={t("settings.engine")}>
            {engineKeys.map((e) => (
              <button key={e} role="tab" className="seg-btn" aria-selected={settings.engine === e} onClick={() => void update({ engine: e })}>
                {t(`settings.engine.${e}`)}
              </button>
            ))}
          </div>
          <h3 className="sub-label mono">{t("settings.gateways")}</h3>
          {settings.gateways.length === 0 ? (
            <p className="empty-note">{t("settings.gateways.empty")} <span className="hint">{t("settings.no-gateway-warning")}</span></p>
          ) : (
            <ul className="rows plain">{settings.gateways.map((g) => (
              <li key={g.id} className="row">
                <span className="row-icon"><Icon role="globe" size={18} /></span>
                <span className="row-text"><span className="row-title">{g.name}</span><span className="row-sub mono">{g.url}</span></span>
              </li>
            ))}</ul>
          )}
        </div>
      </section>
      )}

      {section === "models" && <Models />}
      {section === "privacy" && <Privacy />}
      {section === "backup" && <Backup />}

      {section === "dock" && (
      <section className="panel frame">
        <div className="in">
          <h2 className="panel-title display">{t("settings.dock")}</h2>
          <p className="hint small">{t("settings.dock.help")}</p>
          {settings.dock.length === 0 ? <p className="empty-note">{t("settings.dock.empty")}</p> : (
            <ul className="chips">
              {settings.dock.map((id) => (
                <li key={id}>
                  <span className="chip">
                    <Icon role="pin" size={14} />
                    <span className="mono">{id}</span>
                    <button className="chip-x" aria-label={t("dock.unpin")} onClick={() => void update({ dock: settings.dock.filter((x) => x !== id) })}>
                      <Icon role="close" size={14} />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <button className="btn btn-quiet" onClick={() => go("/modules")}>{t("nav.modules")} <Icon role="chevron-right" size={16} /></button>
        </div>
      </section>
      )}

      {section === "packs" && (
      <section className="panel frame">
        <div className="in">
          <h2 className="panel-title display">{t("settings.packs")}</h2>
          <div className="field-row">
            <span className="field-label mono">{t("settings.packs.icons")}</span>
            <div className="seg" role="radiogroup" aria-label={t("settings.packs.icons")}>
              {packs.icons.map((p) => (
                <button key={p.id} role="radio" aria-checked={settings.iconPack === p.id} className="seg-btn" onClick={() => void update({ iconPack: p.id })}>{p.name}</button>
              ))}
            </div>
          </div>
          <div className="field-row">
            <span className="field-label mono">{t("settings.packs.fonts")}</span>
            <div className="seg" role="radiogroup" aria-label={t("settings.packs.fonts")}>
              {packs.fonts.map((p) => (
                <button key={p.id} role="radio" aria-checked={settings.fontPack === p.id} className="seg-btn" style={{ fontFamily: `${JSON.stringify(p.families.body)},${p.fallbacks.body}` }} onClick={() => void update({ fontPack: p.id })}>{p.name}</button>
              ))}
            </div>
            <p className="hint small">{t("settings.packs.help")}</p>
          </div>
          <p className="hint small">{t("settings.counts", { m: modules.length, p: packs.icons.length + packs.fonts.length + packs.themes.length })}</p>
        </div>
      </section>
      )}

      {section === "modules" && (
        <>
          <ContributionSettingsRows />
          <section className="panel frame">
            <div className="in">
              <h2 className="panel-title display">{t("settings.section.modules")}</h2>
              <p className="hint small">{t("settings.modules.help")}</p>
              <button className="btn btn-quiet" onClick={() => go("/modules")}>{t("nav.modules")} <Icon role="chevron-right" size={16} /></button>
            </div>
          </section>
        </>
      )}

      {section === "tour" && (
      <section className="panel frame">
        <div className="in">
          <h2 className="panel-title display">{t("settings.tour")}</h2>
          <p className="hint">{t("settings.tour.help")}</p>
          <button className="btn btn-secondary" style={{ minHeight: 44 }} onClick={() => { void update({ tourDone: false }); go("/chat"); }}>{t("settings.tour.show")}</button>
        </div>
      </section>
      )}

      {section === "about" && (
      <section className="panel frame">
        <div className="in">
          <h2 className="panel-title display">{t("settings.about")}</h2>
          <div className="field-row">
            <span className="field-label mono">{t("settings.install")}</span>
            {install.state === "ready" && (
              <button className="btn btn-primary" style={{ minHeight: 44 }} onClick={() => void install.install()}>
                <Icon role="download" size={15} /> {t("settings.install.button")}
              </button>
            )}
            <p className="hint small">{t(install.state === "installed" ? "settings.install.done" : install.state === "ready" ? "settings.install.help" : "settings.install.unavailable")}</p>
          </div>

          <div className="field-row">
            <span className="field-label mono">{t("report.title")}</span>
            <ReportProblem />
          </div>

          <p className="mono small">{t("settings.version", { v: "0.1.0" })}</p>
        </div>
      </section>
      )}
        </div>
      </div>
    </div>
  );
}
