// Contributions (R54): what modules add to the shell, read from their manifests as data. Three surfaces live
// here: the live-bar status item in the system capsule, the rows a module adds to Settings, and the command
// list. Nothing in this file names a module: a manifest with a contribution appears with no rebuild, and a
// module switched off leaves the module list, so its row, its timer and its requests go with it.
import { useCallback, useEffect, useRef, useState } from "react";
import { useStore, type ContributionSetting, type ContributionStatus, type ModuleInfo } from "../store";
import { Icon } from "../ui/Icon";

export type ReadState = { value: string; tone: "ok" | "warn" | "off" | null; failed: boolean };

const EMPTY: ReadState = { value: "—", tone: null, failed: false };
const TONES = new Set(["ok", "warn", "off"]);

/** One GET on a declared read path inside the module's namespace. A failed read says so; it never invents a value. */
async function readDeclared(moduleId: string, path: string): Promise<ReadState> {
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), 4000);
  try {
    const r = await fetch(`/api/p/${moduleId}${path}`, { signal: stop.signal, headers: { accept: "application/json" } });
    if (!r.ok) return { value: "—", tone: null, failed: true };
    const body = (await r.json()) as { value?: unknown; tone?: unknown };
    const value = typeof body.value === "string" || typeof body.value === "number" ? String(body.value) : "—";
    const tone = typeof body.tone === "string" && TONES.has(body.tone) ? (body.tone as ReadState["tone"]) : null;
    return { value, tone, failed: false };
  } catch {
    return { value: "—", tone: null, failed: true };
  } finally {
    clearTimeout(timer);
  }
}

/** Reads a declared state path once, then every `intervalMs` while the caller is mounted. The interval is
 *  cleared on unmount and on every dependency change, so a module switched off leaves no timer behind. */
export function useContributionRead(moduleId: string, path: string | undefined, intervalMs = 0): ReadState & { refresh: () => void } {
  const [state, setState] = useState<ReadState>(EMPTY);
  const [nonce, setNonce] = useState(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    if (!path) { setState(EMPTY); return () => { alive.current = false; }; }
    const tick = () => { void readDeclared(moduleId, path).then((next) => { if (alive.current) setState(next); }); };
    tick();
    if (!intervalMs) return () => { alive.current = false; };
    const timer = setInterval(tick, Math.max(5_000, intervalMs));
    return () => { alive.current = false; clearInterval(timer); };
  }, [moduleId, path, intervalMs, nonce]);

  return { ...state, refresh: useCallback(() => setNonce((n) => n + 1), []) };
}

function StatusItem({ module, item }: { module: ModuleInfo; item: ContributionStatus }) {
  const state = useContributionRead(module.id, item.read, item.intervalMs);
  return (
    <span
      className={`capsule-item status ${state.tone ?? ""}${state.failed ? " failed" : ""}`}
      title={`${module.name}: ${item.label}`}
      data-contribution={`${module.id}/${item.id}`}
    >
      <Icon role={item.icon ?? "info"} size={16} />
      <span className="capsule-word mono">{item.label}</span>
      <span className="mono status-value">{state.value}</span>
    </span>
  );
}

/** The live-bar items of every running module, at most three so the capsule never crowds the engine chip. */
export function ContributionStatusItems() {
  const { modules } = useStore();
  const items = modules
    .filter((m) => m.running)
    .flatMap((m) => m.contributions.status.map((item) => ({ module: m, item })))
    .slice(0, 3);
  if (items.length === 0) return null;
  return <>{items.map(({ module, item }) => <StatusItem key={`${module.id}/${item.id}`} module={module} item={item} />)}</>;
}

function postDeclared(moduleId: string, path: string): Promise<Response> {
  return fetch(`/api/p/${moduleId}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
}

function SettingRow({ module, item }: { module: ModuleInfo; item: ContributionSetting }) {
  const { t } = useStore();
  const state = useContributionRead(module.id, item.read);
  const action = item.action ? module.contributions.actions.find((a) => a.id === item.action) : undefined;
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const run = async () => {
    if (!action) return;
    setBusy(true); setNote(null);
    try {
      const r = await postDeclared(module.id, action.path);
      setNote(r.ok ? t("contributions.action.done") : t("contributions.action.failed", { status: r.status }));
    } catch {
      setNote(t("contributions.action.failed", { status: 0 }));
    }
    setBusy(false);
    state.refresh();
  };

  return (
    <li className="contr-row frame" data-contribution={`${module.id}/${item.id}`}>
      <div className="in contr-in">
        <span className="row-icon" aria-hidden="true"><Icon role={item.icon ?? "skills"} size={18} /></span>
        <div className="row-text">
          <span className="row-title">{item.title}</span>
          {item.label && <span className="row-sub mono">{item.label}</span>}
          {item.description && <p className="hint small">{item.description}</p>}
          <span className="mono contrib-source">{module.name}</span>
        </div>
        <div className="row-actions">
          {item.read && <span className="state mono" aria-live="off">{state.value}</span>}
          {item.read && <button className="btn btn-quiet" onClick={state.refresh}>{t("contributions.refresh")}</button>}
          {action && <button className="btn btn-secondary" disabled={busy} onClick={() => void run()}>{action.label}</button>}
        </div>
        {note && <p className="hint small contr-note" role="status">{note}</p>}
      </div>
    </li>
  );
}

/** The rows modules add to Settings. Rendered only for running modules, so a switch-off removes them entirely. */
export function ContributionSettingsRows() {
  const { t, modules } = useStore();
  const rows = modules
    .filter((m) => m.running)
    .flatMap((m) => m.contributions.settings.map((item) => ({ module: m, item })));
  if (rows.length === 0) return null;
  return (
    <section className="panel frame">
      <div className="in">
        <h2 className="panel-title display">{t("settings.contributions")}</h2>
        <p className="hint small">{t("settings.contributions.help")}</p>
        <ul className="contr-list">
          {rows.map(({ module, item }) => <SettingRow key={`${module.id}/${item.id}`} module={module} item={item} />)}
        </ul>
      </div>
    </section>
  );
}