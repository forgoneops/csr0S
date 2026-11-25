// What the app reads from the server once at boot, and the one place that writes settings back.
// Nothing here has a default host, account or path: what is not configured is shown as missing.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Lang } from "./i18n";
import { translate } from "./i18n";

export type Settings = {
  profile: { callMe: string; about: string };
  language: Lang;
  theme: string; palette: string; iconPack: string; fontPack: string;
  motion: "full" | "off"; textScale: number;
  workspaces: { id: string; name: string; widgets: string[] }[]; workspace: string;
  dock: string[]; hidden: string[]; disabledModules: string[]; enabledModules: string[];
  engine: "local" | "vps" | "offline";
  // Where the Brain lives (R47): a setting, never a default host. Local needs no address.
  brain: { location: "local" | "remote"; url: string };
  gateways: { id: string; name: string; url: string; kind: "local" | "vps" }[];
  setupDone: boolean;
  tourDone: boolean;
};

export type NavEntry = { id: string; label: string; name?: string; icon: string; path: string; category: string; order: number; menu: boolean };
// Contributions (R54) as the core reports them for a running module: data only, never code.
export type ContributionAction = { id: string; label: string; path: string; permission?: string };
export type ContributionStatus = { id: string; label: string; icon?: string; read: string; intervalMs: number; permission?: string };
export type ContributionSetting = { id: string; title: string; label?: string; description?: string; icon?: string; read?: string; action?: string; permission?: string };
export type ContributionCommand = { id: string; label: string; hint?: string; icon?: string; action?: string; path?: string; permission?: string };
export type Contributions = { settings: ContributionSetting[]; status: ContributionStatus[]; commands: ContributionCommand[]; actions: ContributionAction[] };
export type ModuleInfo = {
  id: string; name: string; description: string; version: string; group: string;
  edition: "owner" | "standard"; kind?: string; tags: string[]; nav: NavEntry[];
  enabled: boolean; running: boolean; defaultOff: boolean; available: boolean; contributions: Contributions;
};
export type IconPack = { id: string; name: string; version: string; license: string; file: string; roles: string[]; url: string };
export type FontPack = {
  id: string; name: string; version: string; license: string;
  families: { display: string; body: string; mono: string };
  fallbacks: { display: string; body: string; mono: string };
  faces: { family: string; weight: string; style: string; url?: string; subset?: "latin" | "latin-ext" }[];
  href?: string;
};
export type Palette = { id: string; name: string; p1: string; p2: string };
export type ThemePack = { id: string; name: string; version: string; license: string; description?: string; css: string; url: string; palettes: Palette[] };
export type PackIndex = { icons: IconPack[]; fonts: FontPack[]; themes: ThemePack[] };

type Store = {
  settings: Settings;
  packs: PackIndex;
  modules: ModuleInfo[];
  lang: Lang;
  t: (key: string, vars?: Record<string, string | number>) => string;
  update: (patch: Partial<Settings>) => Promise<void>;
  toggleModule: (id: string, enabled: boolean) => Promise<string>;
  reloadModules: () => Promise<void>;
  route: string;
  go: (path: string) => void;
  /** App-level history (R2): the shell's own Back and Forward, same on desktop and phone. */
  nav: { canBack: boolean; canForward: boolean; back: () => void; forward: () => void };
};

const StoreCtx = createContext<Store | null>(null);

export const useStore = () => {
  const s = useContext(StoreCtx);
  if (!s) throw new Error("useStore outside the shell");
  return s;
};

async function get<T>(url: string): Promise<T> {
  const r = await fetch(url, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json() as Promise<T>;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [packs, setPacks] = useState<PackIndex | null>(null);
  const [modules, setModules] = useState<ModuleInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [route, setRoute] = useState(() => location.pathname || "/chat");

  useEffect(() => {
    (async () => {
      try {
        const [s, p, m] = await Promise.all([get<Settings>("/api/settings"), get<PackIndex>("/api/packs"), get<ModuleInfo[]>("/api/plugins/all")]);
        setSettings(s); setPacks(p); setModules(m);
      } catch (e) { setError((e as Error).message); }
    })();
  }, []);

  // Each entry carries its position in history.state, so Back and Forward know whether they have anywhere to go.
  const pos = () => (history.state as { i?: number } | null)?.i ?? 0;
  const [hist, setHist] = useState(() => ({ i: pos(), max: pos() }));

  const go = useCallback((path: string) => {
    if (path !== location.pathname) {
      const i = pos() + 1;
      history.pushState({ i }, "", path);
      setHist({ i, max: i });
    }
    setRoute(path);
  }, []);

  useEffect(() => {
    const onPop = () => { setRoute(location.pathname || "/chat"); setHist((h) => ({ i: pos(), max: Math.max(h.max, pos()) })); };
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);

  const nav = useMemo(() => ({
    canBack: hist.i > 0, canForward: hist.i < hist.max,
    back: () => { if (hist.i > 0) history.back(); }, forward: () => { if (hist.i < hist.max) history.forward(); },
  }), [hist]);

  const update = useCallback(async (patch: Partial<Settings>) => {
    setSettings((cur) => (cur ? { ...cur, ...patch } : cur));          // the screen answers at once
    const r = await fetch("/api/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) });
    if (!r.ok) { const back = await get<Settings>("/api/settings"); setSettings(back); throw new Error(`settings: ${r.status}`); }
    setSettings(await r.json() as Settings);
  }, []);

  const reloadModules = useCallback(async () => { setModules(await get<ModuleInfo[]>("/api/plugins/all")); }, []);
  const toggleModule = useCallback(async (id: string, enabled: boolean) => {
    const r = await fetch(`/api/plugins/${id}/enabled`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabled }) });
    const body = await r.json() as { applied?: string; error?: string; modules?: ModuleInfo[] };
    if (!r.ok) throw new Error(body.error ?? `module: ${r.status}`);
    if (body.modules) setModules(body.modules);
    return body.applied ?? "now";
  }, []);

  const lang: Lang = settings?.language ?? "en";
  const t = useCallback((key: string, vars?: Record<string, string | number>) => translate(lang, key, vars), [lang]);

  const value = useMemo<Store | null>(() => {
    if (!settings || !packs) return null;
    return { settings, packs, modules, lang, t, update, toggleModule, reloadModules, route, go, nav };
  }, [settings, packs, modules, lang, t, update, toggleModule, reloadModules, route, go, nav]);

  if (error) return <BootError message={error} />;
  if (!value) return <BootLoading />;
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

const bootT = (key: string) => translate(typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("pl") ? "pl" : "en", key);

function BootLoading() {
  return (
    <div className="boot" role="status" aria-live="polite">
      <span className="boot-mark" aria-hidden="true">◆</span>
      <span className="boot-text">{bootT("common.loading")}</span>
    </div>
  );
}

function BootError({ message }: { message: string }) {
  return (
    <div className="boot boot-error" role="alert">
      <h1>{bootT("error.load")}</h1>
      <p>{bootT("error.load.body")}</p>
      <pre>{message}</pre>
      <button className="btn btn-primary" onClick={() => location.reload()}>{bootT("common.retry")}</button>
    </div>
  );
}
