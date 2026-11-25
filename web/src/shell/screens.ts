// The screen catalogue (R1, R9): every place a person can go, built from one list so the palette, the rail and
// the drawer cannot disagree. Locked entries are modules this build leaves out; they stay visible with a reason.
import { useMemo } from "react";
import { useStore } from "../store";

export type Screen = { key: string; label: string; hint: string; icon: string; path: string; locked?: boolean };

/** Settings sections, in the order the section list shows them. The path of each is /settings/<id>. */
export const SETTINGS_SECTIONS = [
  { id: "appearance", icon: "theme" },
  { id: "packs", icon: "media" },
  { id: "engine", icon: "engine" },
  { id: "models", icon: "memory" },
  { id: "privacy", icon: "info" },
  { id: "backup", icon: "memory" },
  { id: "dock", icon: "pin" },
  { id: "modules", icon: "skills" },
  { id: "tour", icon: "info" },
  { id: "about", icon: "laurel" },
] as const;
export type SectionId = typeof SETTINGS_SECTIONS[number]["id"];

export const sectionOf = (route: string): SectionId => {
  const id = route.split("/")[2];
  return (SETTINGS_SECTIONS.find((s) => s.id === id)?.id ?? "appearance") as SectionId;
};

export function useScreens(): { screens: Screen[]; locked: Screen[] } {
  const { t, modules } = useStore();
  return useMemo(() => {
    const built: Screen[] = [
      { key: "chat", label: t("nav.chat"), hint: t("nav.chat.latin"), icon: "chat", path: "/chat" },
      { key: "notes", label: t("nav.notes"), hint: t("nav.notes.latin"), icon: "memory", path: "/notes" },
      { key: "projects", label: t("nav.projects"), hint: t("nav.projects.latin"), icon: "folder", path: "/projects" },
      { key: "knowledge", label: t("nav.knowledge"), hint: t("nav.knowledge.latin"), icon: "search", path: "/knowledge" },
      { key: "modules", label: t("nav.modules"), hint: t("nav.modules.latin"), icon: "skills", path: "/modules" },
      { key: "devices", label: t("nav.devices"), hint: t("nav.devices.latin"), icon: "globe", path: "/devices" },
      { key: "start", label: t("start.title"), hint: t("start.title.latin"), icon: "check", path: "/start" },
      { key: "settings", label: t("nav.settings"), hint: t("nav.settings.latin"), icon: "settings", path: "/settings" },
      ...SETTINGS_SECTIONS.map((s): Screen => ({
        key: `settings/${s.id}`, label: `${t("nav.settings")}: ${t(`settings.section.${s.id}`)}`, hint: t("settings.section.hint"), icon: s.icon, path: `/settings/${s.id}`,
      })),
    ];
    const mod = (m: (typeof modules)[number], locked: boolean) => m.nav.filter((n) => n.menu).map((n): Screen => ({
      key: `${m.id}/${n.id}`, label: n.label, hint: locked ? t("locked.reason") : (n.name ?? m.name), icon: n.icon, path: n.path, locked,
    }));
    return {
      screens: [...built, ...modules.filter((m) => m.running).flatMap((m) => mod(m, false))],
      locked: modules.filter((m) => !m.available).flatMap((m) => mod(m, true)),
    };
  }, [modules, t]);
}
