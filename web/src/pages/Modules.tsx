// Modules: what this install has, from manifests alone. Enabling is live; a module that was never
// started in this run says it needs a restart, and nothing pretends otherwise.
import { useState } from "react";
import { useStore } from "../store";
import { Icon } from "../ui/Icon";

export function Modules() {
  const { t, modules, settings, update, toggleModule, go } = useStore();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const pinThis = (navId: string) => {
    const key = navId;
    void update({ dock: settings.dock.includes(key) ? settings.dock.filter((x) => x !== key) : [...settings.dock, key].slice(0, 12) });
  };

  return (
    <div className="page">
      <p className="lede">{t("modules.subtitle")}</p>
      <p className="mono small meta">{t("modules.count", { n: modules.length })}</p>

      {modules.length === 0 ? (
        <section className="empty-plate frame">
          <div className="in">
            <span className="proto-role" aria-hidden="true"><Icon role="skills" size={28} /></span>
            <h2 className="display">{t("modules.title")}</h2>
            <p>{t("modules.empty")}</p>
          </div>
        </section>
      ) : (
        <ul className="rows">
          {modules.map((m) => (
            <li key={m.id} className="row-card frame">
              <div className="in">
                <div className="row-main">
                  <span className={`dot ${m.running ? "on" : ""}`} aria-hidden="true" />
                  <div className="row-text">
                    <h3>{m.name} <span className="mono ver">{m.version}</span></h3>
                    <p>{m.description}</p>
                    <p className="mono small meta">
                      {m.edition === "owner" ? t("modules.edition.owner") : t("modules.edition.standard")}
                      {" · "}
                      {m.nav.length ? t("modules.nav", { list: m.nav.map((n) => n.label).join(", ") }) : t("modules.none")}
                    </p>
                  </div>
                  <div className="row-actions">
                    <button className="btn btn-quiet" onClick={() => pinThis(m.nav[0]?.id ? `${m.id}/${m.nav[0].id}` : m.id)}
                      aria-pressed={settings.dock.includes(m.nav[0]?.id ? `${m.id}/${m.nav[0].id}` : m.id)}>
                      <Icon role="pin" size={16} />{t("dock.pin")}
                    </button>
                    <button className="btn btn-secondary" disabled={busy === m.id || !m.available}
                      title={m.available ? undefined : t("modules.unavailable")}
                      onClick={async () => {
                        setBusy(m.id); setNote(null);
                        try {
                          const applied = await toggleModule(m.id, !m.enabled);
                          if (applied === "restart") setNote(`${m.name}: ${t("modules.restart")}`);
                        } catch (e) { setNote((e as Error).message); }
                        setBusy(null);
                      }}>
                      {m.available ? (m.enabled ? t("modules.disable") : t("modules.enable")) : t("modules.unavailable")}
                    </button>
                  </div>
                </div>
                <span className={`state mono ${m.enabled ? "on" : ""}`}>{m.enabled ? t("modules.enabled") : t("modules.disabled")}</span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {note && <p className="hint" role="status">{note}</p>}
      <p className="hint small" role="note">{t("modules.empty")}</p>
      <button className="btn btn-quiet" onClick={() => go("/settings")}>
        {t("settings.packs")} <Icon role="chevron-right" size={16} />
      </button>
    </div>
  );
}
