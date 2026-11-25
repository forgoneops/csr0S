// The shell frame (decisions D1, D2, D3): a 56 px rail with 316 px flyouts, a dock of pinned
// shortcuts, and one system capsule with the engine chip and the icon-only Motion control.
// Desktop and phone are the same frame: the rail becomes a drawer and a five-item bottom bar.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore, type NavEntry } from "../store";
import { useApplyPacks } from "../packs";
import { Icon } from "../ui/Icon";
import { Capsule } from "./Capsule";
import { RailFlyout, type FlyoutId } from "./Flyouts";
import { Background } from "./Background";
import { Chat } from "../pages/Chat";
import { Modules } from "../pages/Modules";
import { Devices } from "../pages/Devices";
import { Start } from "../pages/Start";
import { Tour } from "./Tour";
import { useScreens } from "./screens";
import { LockedRow } from "./LockedRow";
import { useEdgeSwipe } from "./useEdgeSwipe";
import { CommandPalette } from "./Palette";
import { Notes } from "../pages/Notes";
import { Knowledge } from "../pages/Knowledge";
import { Projects } from "../pages/Projects";
import { Home } from "../pages/Home";
import { Ticker } from "./Ticker";
import { Intro } from "./Intro";
import { SettingsPage } from "../pages/Settings";
import { ModulePage } from "../pages/ModulePage";
import { TerminalHost } from "../terminal/TerminalHost";
import { useTerminalPane } from "../terminal/state";

type App = { id: string; label: string; latin: string; icon: string; path: string; category: string };

export function App() {
  useApplyPacks();
  const { settings, modules, t, route, go, nav } = useStore();
  const { locked } = useScreens();
  const term = useTerminalPane();
  // The opening runs once per browser session, only with Motion on, never under automation or with ?intro=0.
  const [intro, setIntro] = useState(() => { try { if (/[?&]intro=1/.test(location.search)) return true; return sessionStorage.getItem("intro") !== "done" && !navigator.webdriver && !/[?&]intro=0/.test(location.search); } catch { return false; } });
  const endIntro = useCallback(() => { try { sessionStorage.setItem("intro", "done"); } catch { /* shown again next time, harmless */ } setIntro(false); }, []);
  const [open, setOpen] = useState<FlyoutId | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);
  const railRef = useRef<HTMLElement | null>(null);
  const menuBtnRef = useRef<HTMLButtonElement | null>(null);

  // The drawer is a dialog: focus moves into it when it opens and comes back to the button that opened it.
  useEffect(() => {
    if (drawer) document.querySelector<HTMLElement>(".sheet .row")?.focus({ preventScroll: true });
    else menuBtnRef.current?.focus({ preventScroll: true });
  }, [drawer]);


  const apps = useMemo<App[]>(() => {
    const builtin: App[] = [
      { id: "chat", label: t("nav.chat"), latin: t("nav.chat.latin"), icon: "chat", path: "/chat", category: "talk" },
      { id: "modules", label: t("nav.modules"), latin: t("nav.modules.latin"), icon: "skills", path: "/modules", category: "system" },
      { id: "notes", label: t("nav.notes"), latin: t("nav.notes.latin"), icon: "memory", path: "/notes", category: "knowledge" },
      { id: "projects", label: t("nav.projects"), latin: t("nav.projects.latin"), icon: "folder", path: "/projects", category: "work" },
      { id: "knowledge", label: t("nav.knowledge"), latin: t("nav.knowledge.latin"), icon: "search", path: "/knowledge", category: "knowledge" },
      { id: "devices", label: t("nav.devices"), latin: t("nav.devices.latin"), icon: "globe", path: "/devices", category: "system" },
    ];
    const fromModules: App[] = modules.filter((m) => m.running).flatMap((m) => m.nav.filter((n) => n.menu).map((n: NavEntry) => ({
      id: `${m.id}/${n.id}`, label: n.label, latin: n.name ?? m.name, icon: n.icon, path: n.path, category: n.category,
    })));
    return [...builtin, ...fromModules];
  }, [modules, t]);

  const hidden = new Set(settings.hidden);
  const visible = apps.filter((a) => !hidden.has(a.id.replace("/", ":")));
  const pinned = settings.dock.map((id) => apps.find((a) => a.id === id)).filter((a): a is App => !!a);

  const page = usePage(route, apps, t);
  // First run: land on /start once. Skip there sets setupDone, so this never traps anyone.
  useEffect(() => { if (!settings.setupDone && route !== "/start") go("/start"); }, [settings.setupDone, route, go]);

  // Escape closes whatever is open; Ctrl+` toggles the terminal from anywhere (D1 keyboard map).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "`") { e.preventDefault(); term.toggle(); return; }
      // Ctrl+K lists the commands modules declared (R54). It is the same list the top-bar button opens.
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette((v) => !v); return; }
      if (e.key === "Escape") { setOpen(null); setDrawer(false); setPalette(false); }
    };
    const onDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".rail") && !target.closest(".flyout") && !target.closest(".bottom-bar")) setOpen(null);
    };
    addEventListener("keydown", onKey);
    addEventListener("pointerdown", onDown);
    return () => { removeEventListener("keydown", onKey); removeEventListener("pointerdown", onDown); };
  }, [term]);

  useEdgeSwipe(nav);
  const navigate = useCallback((path: string) => { go(path); setOpen(null); setDrawer(false); }, [go]);

  return (
    <div className="app">
      {intro && settings.motion === "full" && <Intro onDone={endIntro} />}
      <a className="skip" href="#main">{t("a11y.skip")}</a>
      <Background />
      <Tour />
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
      <nav className="rail" aria-label={t("a11y.rail")} ref={railRef}>
        <button className="rail-brand" aria-label={t("app.name")} title={t("app.tagline")} onClick={() => navigate("/")}>
          <Icon role="laurel" size={22} />
        </button>
        <button
          className="rail-item rail-apps" aria-label={t("nav.apps")} aria-expanded={open === "apps"}
          // Hover already opened it for a mouse, so a mouse click keeps it open instead of closing it under the pointer;
          // touch and keyboard have no hover, so for them the same control toggles.
          onClick={(e) => setOpen((e.nativeEvent as PointerEvent).pointerType === "mouse" ? "apps" : open === "apps" ? null : "apps")}
          onPointerEnter={(e) => { if (e.pointerType === "mouse") setOpen("apps"); }}
          onFocus={(e) => { if (e.currentTarget.matches(":focus-visible")) setOpen("apps"); }}
        >
          <Icon role="menu" size={19} />
        </button>
        <div className="rail-rule" aria-hidden="true" />
        <ul className="rail-list">
          {visible.map((a) => {
            const active = route === a.path || route.startsWith(a.path + "/");
            return (
              <li key={a.id}>
                <button
                  className={`rail-item ${active ? "on" : ""}`}
                  aria-label={t("rail.open", { name: a.label })}
                  aria-current={active ? "page" : undefined}
                  aria-expanded={open === a.id}
                  onClick={() => { navigate(a.path); setOpen(a.id === open ? null : a.id); }}
                  onPointerEnter={(e) => { if (e.pointerType === "mouse") setOpen(a.id); }}
                  onFocus={(e) => { if (e.currentTarget.matches(":focus-visible")) setOpen(a.id); }}
                >
                  <Icon role={a.icon} size={19} />
                </button>
              </li>
            );
          })}
        </ul>
        <div className="rail-grow" />
        {pinned.length > 0 && <div className="rail-rule" aria-hidden="true" />}
        {pinned.length > 0 && (
          <ul className="rail-list rail-pins" aria-label={t("a11y.dock")}>
            {pinned.map((a) => (
              <li key={`pin-${a.id}`}>
                <button className="rail-item pin" aria-label={t("rail.open", { name: a.label })}
                  onClick={() => navigate(a.path)}
                  onPointerEnter={(e) => { if (e.pointerType === "mouse") setOpen("dock"); }}
                  onFocus={(e) => { if (e.currentTarget.matches(":focus-visible")) setOpen("dock"); }}>
                  <Icon role={a.icon} size={18} />
                  <span className="pin-mark" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <button className="rail-item rail-settings" aria-label={t("rail.open", { name: t("nav.settings") })}
          aria-expanded={open === "settings"} onClick={() => { navigate("/settings"); }}
          onPointerEnter={(e) => { if (e.pointerType === "mouse") setOpen("settings"); }}
          onFocus={(e) => { if (e.currentTarget.matches(":focus-visible")) setOpen("settings"); }}>
          <Icon role="settings" size={19} />
        </button>
      </nav>

      {open && (
        <RailFlyout id={open} apps={apps} pinned={pinned} onNavigate={navigate} onClose={() => setOpen(null)} />
      )}

      <div className="main">
        <header className="topbar">
          <button ref={menuBtnRef} className="icon-btn menu-btn" aria-label={t("nav.apps")} aria-expanded={drawer} onClick={() => setDrawer(true)}>
            <Icon role="menu" />
          </button>
          <div className="history" role="group" aria-label={t("history.label")}>
            <button className="icon-btn flip" aria-label={t("history.back")} title={t("history.back")} disabled={!nav.canBack} onClick={nav.back}><Icon role="chevron-right" /></button>
            <button className="icon-btn" aria-label={t("history.forward")} title={t("history.forward")} disabled={!nav.canForward} onClick={nav.forward}><Icon role="chevron-right" /></button>
          </div>
          <div className="titles">
            <h1>{page.title}</h1>
            <span className="latin">{page.latin}</span>
          </div>
          <div className="topbar-end">
            <button
              className="icon-btn palette-open" aria-label={t("palette.open")} title={t("palette.open")}
              aria-haspopup="dialog" aria-expanded={palette} onClick={() => setPalette(true)}
            >
              <Icon role="command" />
            </button>
            <button
              className={`icon-btn term-open ${term.state.open ? "on" : ""}`}
              aria-label={t("terminal.open")} aria-pressed={term.state.open}
              title={t("terminal.open")} onClick={() => term.toggle()}
            >
              <Icon role="terminal" />
            </button>
            <Capsule />
          </div>
        </header>
        <main id="main" className="content" tabIndex={-1}>
          {route !== "/" && <div className="banner" data-art={bannerFor(route)} aria-hidden="true" />}
          {page.node}
        </main>
      </div>

      <Ticker />

      <nav className="bottom-bar" aria-label={t("a11y.rail")}>
        {([["/chat", "chat", "nav.chat"], ["/notes", "memory", "nav.notes"], ["/devices", "globe", "nav.devices"], ["/modules", "skills", "nav.modules"]] as const).map(([path, icon, key]) => (
          <button key={path} className={`bar-item ${route === path ? "on" : ""}`} onClick={() => navigate(path)} aria-current={route === path ? "page" : undefined} aria-label={t(key)}>
            <Icon role={icon} /><span>{t(key)}</span>
          </button>
        ))}
        <button className={`bar-item ${route.startsWith("/settings") ? "on" : ""}`} onClick={() => navigate("/settings")} aria-current={route.startsWith("/settings") ? "page" : undefined} aria-label={t("nav.settings")}>
          <Icon role="settings" /><span>{t("nav.settings")}</span>
        </button>
        <button className="bar-item" onClick={() => setDrawer(true)} aria-label={t("rail.more")}>
          <Icon role="menu" /><span>{t("rail.more")}</span>
        </button>
      </nav>

      {drawer && (
        <div className="sheet-wrap" role="presentation" onClick={() => setDrawer(false)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-label={t("nav.apps")} onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <span className="mono">{t("nav.apps")}</span>
              <span className="history sheet-history">
                <button className="icon-btn flip" aria-label={t("history.back")} disabled={!nav.canBack} onClick={() => { nav.back(); setDrawer(false); }}><Icon role="chevron-right" /></button>
                <button className="icon-btn" aria-label={t("history.forward")} disabled={!nav.canForward} onClick={() => { nav.forward(); setDrawer(false); }}><Icon role="chevron-right" /></button>
              </span>
              <button className="icon-btn" aria-label={t("common.close")} onClick={() => setDrawer(false)}><Icon role="close" /></button>
            </div>
            <ul className="sheet-list">
              {pinned.length > 0 && <li><h2 className="section-label mono">{t("nav.pinned")}</h2></li>}
              {pinned.map((a) => (
                <li key={`pin-${a.id}`}>
                  <button className="row" onClick={() => navigate(a.path)} aria-current={route === a.path ? "page" : undefined}>
                    <span className="row-icon"><Icon role="pin" size={19} /></span>
                    <span className="row-text"><span className="row-title">{a.label}</span><span className="row-sub mono">{a.latin}</span></span>
                    <Icon role="chevron-right" size={18} />
                  </button>
                </li>
              ))}
              {pinned.length > 0 && <li><h2 className="section-label mono">{t("nav.apps")}</h2></li>}
              {visible.map((a) => (
                <li key={a.id}>
                  <button className="row" onClick={() => navigate(a.path)} aria-current={route === a.path ? "page" : undefined}>
                    <span className="row-icon"><Icon role={a.icon} size={19} /></span>
                    <span className="row-text"><span className="row-title">{a.label}</span><span className="row-sub mono">{a.latin}</span></span>
                    <Icon role="chevron-right" size={18} />
                  </button>
                </li>
              ))}
              {locked.map((a) => <LockedRow key={a.key} label={a.label} />)}
              <li>
                <button className="row" onClick={() => navigate("/settings")}>
                  <span className="row-icon"><Icon role="settings" size={19} /></span>
                  <span className="row-text"><span className="row-title">{t("nav.settings")}</span><span className="row-sub mono">{t("nav.settings.latin")}</span></span>
                  <Icon role="chevron-right" size={18} />
                </button>
              </li>
            </ul>
          </div>
        </div>
      )}

      <TerminalHost />
    </div>
  );
}

/** Which banner a place wears: the theme decides whether it has any art for it (R46); a theme without art shows nothing. */
const bannerFor = (route: string): string =>
  route.startsWith("/settings") || route === "/start" ? "system"
  : route === "/chat" || route.startsWith("/chat/") ? "command"
  : route === "/notes" || route === "/knowledge" || route === "/projects" ? "archive"
  : route === "/devices" || route === "/modules" ? "forge" : "warroom";

function usePage(route: string, apps: App[], t: (k: string, v?: Record<string, string | number>) => string): { title: string; latin: string; node: React.ReactNode } {
  if (route === "/settings" || route.startsWith("/settings/")) return { title: t("settings.title"), latin: t("nav.settings.latin"), node: <SettingsPage /> };
  if (route === "/modules") return { title: t("modules.title"), latin: t("nav.modules.latin"), node: <Modules /> };
  if (route === "/start") return { title: t("start.title"), latin: t("start.title.latin"), node: <Start /> };
  if (route === "/") return { title: t("home.title"), latin: t("home.title.latin"), node: <Home /> };
  if (route === "/projects") return { title: t("nav.projects"), latin: t("nav.projects.latin"), node: <Projects /> };
  if (route === "/knowledge") return { title: t("nav.knowledge"), latin: t("nav.knowledge.latin"), node: <Knowledge /> };
  if (route === "/notes") return { title: t("nav.notes"), latin: t("nav.notes.latin"), node: <Notes /> };
  if (route === "/devices") return { title: t("devices.title"), latin: t("nav.devices.latin"), node: <Devices /> };
  const app = apps.find((a) => a.path !== "/" && (route === a.path || route.startsWith(a.path + "/")));
  if (app && app.id === "chat") return { title: t("chat.title"), latin: t("nav.chat.latin"), node: <Chat /> };
  if (app) return { title: app.label, latin: app.latin, node: <ModulePage path={app.path} name={app.label} /> };
  return { title: t("chat.title"), latin: t("nav.chat.latin"), node: <Chat /> };
}

