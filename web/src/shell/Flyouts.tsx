// Flyouts: the 316 px panels hanging off the rail (D1). One panel per rail item, grouped by what the
// person is doing. Every row is 44 px and reachable by keyboard; the panel is a dialog only on phones.
import { useEffect, useRef } from "react";
import { useStore } from "../store";
import { Icon } from "../ui/Icon";
import { useScreens } from "./screens";
import { LockedRow } from "./LockedRow";

export type FlyoutId = string;

type App = { id: string; label: string; latin: string; icon: string; path: string; category: string };

export function RailFlyout({ id, apps, pinned, onNavigate, onClose }: {
  id: FlyoutId; apps: App[]; pinned: App[];
  onNavigate: (path: string) => void; onClose: () => void;
}) {
  const { t, settings, update, modules, lang, packs } = useStore();
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => { ref.current?.querySelector<HTMLElement>(".row")?.focus({ preventScroll: true }); }, [id]);

  const title = id === "apps" ? t("nav.apps") : id === "dock" ? t("dock.title") : id === "settings" ? t("nav.settings") : (apps.find((a) => a.id === id)?.label ?? id);
  const pin = (appId: string) => update({ dock: settings.dock.includes(appId) ? settings.dock.filter((x) => x !== appId) : [...settings.dock, appId].slice(0, 12) });

  const groups = [...new Set(apps.map((a) => a.category))];
  const { locked } = useScreens();

  return (
    <div className="flyout" ref={ref} role="dialog" aria-label={t("a11y.flyout", { name: title })}>
      <div className="flyout-head">
        <span className="mono">{title}</span>
        <button className="icon-btn sm" onClick={onClose} aria-label={t("flyout.close")}><Icon role="close" size={18} /></button>
      </div>

      {id === "apps" && groups.map((g) => (
        <section key={g} className="flyout-section">
          <h2 className="section-label mono">{t(`nav.group.${g}`)}</h2>
          <ul>
            {apps.filter((a) => a.category === g).map((a) => (
              <li key={a.id} className="row-wrap">
                <button className="row" onClick={() => onNavigate(a.path)}>
                  <span className="row-icon"><Icon role={a.icon} size={19} /></span>
                  <span className="row-text"><span className="row-title">{a.label}</span><span className="row-sub mono">{a.latin}</span></span>
                </button>
                <button className={`pin-btn ${settings.dock.includes(a.id) ? "on" : ""}`}
                  aria-label={`${settings.dock.includes(a.id) ? t("dock.unpin") : t("dock.pin")}: ${a.label}`}
                  aria-pressed={settings.dock.includes(a.id)} onClick={() => void pin(a.id)}>
                  <Icon role="pin" size={16} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {id === "apps" && locked.length > 0 && (
        <section className="flyout-section">
          <h2 className="section-label mono">{t("locked.title")}</h2>
          <ul>{locked.map((a) => <LockedRow key={a.key} label={a.label} />)}</ul>
        </section>
      )}

      {id === "dock" && (
        <section className="flyout-section">
          <h2 className="section-label mono">{t("nav.pinned")}</h2>
          {pinned.length === 0 ? (
            <p className="empty-note">{t("dock.empty")}</p>
          ) : (
            <ul>
              {pinned.map((a) => (
                <li key={a.id} className="row-wrap">
                  <button className="row" onClick={() => onNavigate(a.path)}>
                    <span className="row-icon"><Icon role={a.icon} size={19} /></span>
                    <span className="row-text"><span className="row-title">{a.label}</span><span className="row-sub mono">{a.latin}</span></span>
                  </button>
                  <button className="pin-btn on" aria-label={`${t("dock.unpin")}: ${a.label}`} aria-pressed="true" onClick={() => void pin(a.id)}>
                    <Icon role="pin" size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="empty-note small">{t("dock.hint")}</p>
        </section>
      )}

      {id === "settings" && (
        <>
          <section className="flyout-section">
            <h2 className="section-label mono">{t("settings.theme")}</h2>
            <div className="seg" role="tablist" aria-label={t("settings.theme")}>
              {packs.themes.map((p) => (
                <button key={p.id} role="tab" aria-selected={settings.theme === p.id} className="seg-btn" onClick={() => void update({ theme: p.id })}>{p.name}</button>
              ))}
            </div>
          </section>
          <section className="flyout-section">
            <h2 className="section-label mono">{t("settings.language")}</h2>
            <div className="seg" role="tablist" aria-label={t("a11y.language")}>
              {(["en", "pl"] as const).map((l) => (
                <button key={l} role="tab" aria-selected={lang === l} className="seg-btn" onClick={() => void update({ language: l })}>{l === "en" ? t("common.english") : t("common.polish")}</button>
              ))}
            </div>
          </section>
          <section className="flyout-section">
            <button className="row" onClick={() => void update({ motion: settings.motion === "off" ? "full" : "off" })}>
              <span className="row-icon"><Icon role="motion" size={19} /></span>
              <span className="row-text"><span className="row-title">{t("settings.motion")}</span><span className="row-sub mono">{settings.motion === "off" ? t("capsule.motion.off") : t("capsule.motion.full")}</span></span>
            </button>
            <button className="row" onClick={() => onNavigate("/settings")}>
              <span className="row-icon"><Icon role="settings" size={19} /></span>
              <span className="row-text"><span className="row-title">{t("settings.title")}</span></span>
              <Icon role="chevron-right" size={18} />
            </button>
          </section>
        </>
      )}

      {id === "chat" && (
        <section className="flyout-section">
          <h2 className="section-label mono">{t("chat.title")}</h2>
          <p className="empty-note">{t("chat.empty.title")}</p>
          <button className="btn btn-primary" onClick={() => onNavigate("/chat")}>{t("chat.title")}</button>
        </section>
      )}

      {id === "modules" && (
        <section className="flyout-section">
          <h2 className="section-label mono">{t("modules.count", { n: modules.length })}</h2>
          {modules.length === 0 ? <p className="empty-note">{t("modules.empty")}</p> : (
            <ul>
              {modules.map((m) => (
                <li key={m.id}>
                  <button className="row" onClick={() => onNavigate("/modules")}>
                    <span className={`dot ${m.running ? "on" : ""}`} aria-hidden="true" />
                    <span className="row-text"><span className="row-title">{m.name}</span><span className="row-sub mono">{m.version} · {m.edition === "owner" ? t("modules.edition.owner") : t("modules.edition.standard")}</span></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {!["apps", "dock", "settings", "chat", "modules"].includes(id) && (
        <section className="flyout-section">
          <p className="empty-note">{t("modules.none")}</p>
          <button className="btn btn-secondary" onClick={() => onNavigate(apps.find((a) => a.id === id)?.path ?? "/modules")}>{t("rail.open", { name: title })}</button>
        </section>
      )}
    </div>
  );
}
