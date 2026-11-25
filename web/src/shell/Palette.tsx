// The command list (R54): a module's declared commands, found with Ctrl+K or the top-bar button. Small on
// purpose: it lists only commands from running modules' manifests and an empty list is honest. Nothing can be
// typed into it that is then executed; a command is a named action or an app route the manifest declared.
import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store";
import { Icon } from "../ui/Icon";
import { useScreens } from "./screens";

type Entry = { key: string; label: string; hint: string; icon: string; locked?: boolean; run: () => Promise<void> };

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, modules, go } = useStore();
  const [query, setQuery] = useState("");
  const [said, setSaid] = useState<string | null>(null);   // a locked row tapped: say why, in words, and stay open
  const input = useRef<HTMLInputElement | null>(null);

  const commands = useMemo<Entry[]>(() => modules.filter((m) => m.running).flatMap((m) =>
    m.contributions.commands.flatMap((c): Entry[] => {
      const action = c.action ? m.contributions.actions.find((a) => a.id === c.action) : undefined;
      const base = { key: `${m.id}/${c.id}`, label: c.label, hint: c.hint ?? m.name, icon: c.icon ?? "command" };
      if (action) return [{ ...base, run: async () => { await fetch(`/api/p/${m.id}${action.path}`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }); onClose(); } }];
      if (c.path) return [{ ...base, run: async () => { go(c.path!); onClose(); } }];
      return [];
    }),
  ), [modules, go, onClose]);

  // Screens first ("Go to"), then module commands: the list is never empty, even on a fresh install (R1).
  const { screens, locked } = useScreens();
  const places = useMemo<Entry[]>(() => [...screens, ...locked].map((s) => ({
    key: `go:${s.key}`, label: s.label, hint: s.hint, icon: s.icon, locked: s.locked, run: async () => { if (s.locked) { setSaid(`go:${s.key}`); return; } go(s.path); onClose(); },
  })), [screens, locked, go, onClose]);
  const match = (c: Entry) => `${c.label} ${c.hint}`.toLowerCase().includes(query.trim().toLowerCase());
  const goTo = places.filter(match), cmds = commands.filter(match);
  const shown = [...goTo.filter((c) => !c.locked), ...cmds];

  useEffect(() => {
    if (!open) return;
    setQuery(""); setSaid(null);
    const focus = setTimeout(() => input.current?.focus({ preventScroll: true }), 0);
    return () => clearTimeout(focus);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
      else if (e.key === "Enter" && shown[0]) { e.preventDefault(); void shown[0].run(); }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [open, shown, onClose]);

  if (!open) return null;
  return (
    <div className="palette-wrap" role="presentation" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="palette panel frame" role="dialog" aria-modal="true" aria-label={t("palette.title")}>
        <div className="in">
          <div className="palette-head">
            <Icon role="command" size={18} />
            <input
              ref={input} className="field palette-input" value={query} spellCheck={false} autoComplete="off"
              onChange={(e) => setQuery(e.target.value)} placeholder={t("palette.placeholder")} aria-label={t("palette.title")}
            />
            <button className="icon-btn" aria-label={t("common.close")} onClick={onClose}><Icon role="close" size={18} /></button>
          </div>
          {goTo.length + cmds.length === 0 ? (
            <p className="empty-note">{t("palette.no-match")}</p>
          ) : (
            <div className="palette-list">
              {[[t("palette.goto"), goTo], [t("palette.commands"), cmds]].map(([title, list]) => (list as Entry[]).length > 0 && (
                <section key={title as string}>
                  <h2 className="section-label mono">{title as string}</h2>
                  <ul>
                    {(list as Entry[]).map((c) => (
                      <li key={c.key}>
                        <button className={`row ${c.locked ? "locked" : ""}`} data-command={c.key} aria-expanded={c.locked ? said === c.key : undefined} onClick={() => void c.run()}>
                          <span className="row-icon"><Icon role={c.locked ? "lock" : c.icon} size={18} /></span>
                          <span className="row-text"><span className="row-title">{c.label}</span><span className="row-sub mono">{said === c.key ? t("locked.why") : c.hint}</span></span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
          <p className="hint small">{t("palette.hint")}</p>
        </div>
      </div>
    </div>
  );
}