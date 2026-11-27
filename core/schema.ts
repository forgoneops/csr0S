// The contract between frontend, core and modules. Both sides import these types.
// Nothing here names a product feature: the core is a shell, a chat surface, settings and packs.
import { z } from "zod";

// What a person is doing, not how CaesarOS is built: the rail flyouts group by these.
export const NAV_CATEGORIES = ["talk", "day", "work", "knowledge", "make", "system"] as const;
export type NavCategory = (typeof NAV_CATEGORIES)[number];

export const MODULE_GROUPS = ["core", "knowledge", "day", "dev", "media", "client", "system"] as const;
export type ModuleGroup = (typeof MODULE_GROUPS)[number];

export const NavEntry = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  label: z.string(),        // what it is, in plain words ("Board")
  name: z.string().optional(), // its name in CaesarOS's world ("Tabularium"); shown beside the label
  icon: z.string().regex(/^[a-z][a-z0-9-]*$/), // an icon ROLE, never a file (R46)
  path: z.string().regex(/^\/[a-z0-9/_-]*$/),
  category: z.enum(NAV_CATEGORIES).default("system"),
  order: z.number().default(50),
  menu: z.boolean().default(true),
});
export type NavEntry = z.infer<typeof NavEntry>;

// ---------- contributions (R54): what a module adds to the shell, declared as data ----------
// The shell renders these from the manifest alone, so a new contribution never needs a web rebuild.
// Three capability tiers, smallest first:
//   read    a GET path inside the module's own namespace (/api/p/<id><path>), read-only, answers {value, tone}
//   action  a declared POST path; the shell may call only paths named in `contributions.actions`
//   api     the module's own namespaced door /api/p/<id>/ stays the module's; the shell never calls a path
//           that the manifest did not declare
// A contribution may name a `permission`; the core drops it unless that permission is in the manifest's
// `permissions` list. The edition gate applies before any of this: an owner module contributes nothing in a
// consumer build, because it is never started.
const slug = z.string().regex(/^[a-z][a-z0-9-]*$/);
const innerPath = z.string().regex(/^\/[a-z0-9/_-]*$/);   // relative to /api/p/<id>: no scheme, no ".."
const permission = z.string().max(40).optional();

export const ContributionAction = z.object({
  id: slug,
  label: z.string().max(40),
  path: innerPath,
  permission,
});
export type ContributionAction = z.infer<typeof ContributionAction>;

export const ContributionStatus = z.object({
  id: slug,
  label: z.string().max(40),          // the word beside the value in the capsule
  icon: slug.optional(),              // an icon ROLE
  read: innerPath,                    // GET, answers { value: string, tone?: "ok"|"warn"|"off" }
  intervalMs: z.number().int().min(5_000).max(600_000).default(30_000),
  permission,
});
export type ContributionStatus = z.infer<typeof ContributionStatus>;

export const ContributionSettings = z.object({
  id: slug,
  title: z.string().max(60),
  label: z.string().max(120).optional(),
  description: z.string().max(300).optional(),
  icon: slug.optional(),
  read: innerPath.optional(),         // shown as the row's state, refreshed by its own button
  action: slug.optional(),            // the id of a declared action, run by the row's button
  permission,
});
export type ContributionSettings = z.infer<typeof ContributionSettings>;

export const ContributionCommand = z.object({
  id: slug,
  label: z.string().max(60),
  hint: z.string().max(80).optional(),
  icon: slug.optional(),
  action: slug.optional(),            // the id of a declared action; or
  path: z.string().regex(/^\/[a-z0-9/_-]*$/).optional(),  // an app route to open
  permission,
}).refine((c) => Boolean(c.action || c.path), "a command needs an action or a path");
export type ContributionCommand = z.infer<typeof ContributionCommand>;

export const Contributions = z.object({
  settings: z.array(ContributionSettings).default([]),
  status: z.array(ContributionStatus).default([]),
  commands: z.array(ContributionCommand).default([]),
  actions: z.array(ContributionAction).default([]),
});
export type Contributions = z.infer<typeof Contributions>;
const noContributions: Contributions = { settings: [], status: [], commands: [], actions: [] };

export const PluginManifest = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  name: z.string(),
  version: z.string(),
  description: z.string(),
  nav: z.array(NavEntry).default([]),
  group: z.enum(MODULE_GROUPS).default("system"),
  tags: z.array(z.string().regex(/^[a-z][a-z0-9-]*$/)).default([]),
  // More paths the module's page answers (a prefix: "/today" also serves /today/2026-11-22).
  routes: z.array(z.string().regex(/^\/[a-z0-9/_-]*$/)).default([]),
  // Rows the module adds to Settings (the component form is legacy; `contributions.settings` is the data form).
  settings: z.array(z.object({ id: z.string().regex(/^[a-z][a-z0-9-]*$/), title: z.string(), label: z.string().optional() })).default([]),
  // What the module adds to the shell: settings rows, live-bar items, commands. Data only (R54).
  contributions: Contributions.default(noContributions),
  // Who the module is for. "owner" = a person's own layer: never started in a consumer build.
  // Unmarked means owner, so a new module can never leak into a consumer build by accident.
  edition: z.enum(["owner", "standard"]).default("owner"),
  // A module that is found but off until the person enables it (a dev fixture, an optional extra).
  defaultOff: z.boolean().default(false),
  kind: z.string().max(30).optional(),
  permissions: z.array(z.string()).default([]),
}).superRefine((m, ctx) => {
  // A declared action is the only write door; a reference to one that is not declared is a broken manifest.
  const actionIds = new Set(m.contributions.actions.map((a) => a.id));
  const refs: [string, string, string | undefined][] = [
    ...m.contributions.settings.map((s) => ["settings", s.id, s.action] as [string, string, string | undefined]),
    ...m.contributions.commands.map((c) => ["commands", c.id, c.action] as [string, string, string | undefined]),
  ];
  for (const [surface, id, action] of refs) {
    if (action && !actionIds.has(action)) ctx.addIssue({ code: "custom", path: ["contributions", surface, id], message: `action "${action}" is not declared in contributions.actions` });
  }
  // Ids must be unique inside a surface, so a row, an item or a command is never ambiguous.
  for (const surface of ["settings", "status", "commands", "actions"] as const) {
    const seen = new Set<string>();
    for (const item of m.contributions[surface]) {
      if (seen.has(item.id)) ctx.addIssue({ code: "custom", path: ["contributions", surface], message: `duplicate id "${item.id}"` });
      seen.add(item.id);
    }
  }
});
export type PluginManifest = z.infer<typeof PluginManifest>;

/** What a module may add to the shell right now: only a running module, and only contributions whose
 *  permission (when it names one) is in the manifest's permissions. Everything else is dropped, so a
 *  disabled module and an owner module in a consumer build contribute nothing at all. */
export function visibleContributions(manifest: PluginManifest, running: boolean): Contributions {
  if (!running) return noContributions;
  const allowed = new Set(manifest.permissions);
  const ok = <T extends { permission?: string }>(c: T) => !c.permission || allowed.has(c.permission);
  return {
    settings: manifest.contributions.settings.filter(ok),
    status: manifest.contributions.status.filter(ok),
    commands: manifest.contributions.commands.filter(ok),
    actions: manifest.contributions.actions.filter(ok),
  };
}

// Everything the app needs to know, and nothing else. No host, account or path points anywhere by default:
// a fresh install has one local engine and no gateway, and the first-run flow offers only what it finds.
// A stored address is contacted by the core, so only http(s) without credentials may be stored, however it got here.
const httpUrl = z.string().max(500).refine((v) => { try { const u = new URL(v); return (u.protocol === "http:" || u.protocol === "https:") && !u.username && !u.password; } catch { return false; } }, "http or https address without credentials");
const SettingsShape = z.object({
  profile: z.object({
    callMe: z.string().max(80).default(""),
    about: z.string().max(2000).default(""),
    business: z.string().max(400).default(""),
    // The person's own handles. Saved on this machine only; posting or live numbers need each service's own key, added later.
    accounts: z.array(z.object({ platform: z.string().regex(/^[a-z0-9-]{1,30}$/), handle: z.string().max(200) })).max(24).default([]),
  }).default({ callMe: "", about: "", business: "", accounts: [] }),
  language: z.enum(["en", "pl"]).default("en"),
  theme: z.string().regex(/^[a-z][a-z0-9-]*$/).default("neo-roma"),    // a theme pack id
  palette: z.string().regex(/^[a-z][a-z0-9-]*$/).max(30).or(z.literal("")).default(""),   // one of the theme's palettes; empty = its first
  iconPack: z.string().regex(/^[a-z][a-z0-9-]*$/).default("ds0"),       // an icon pack id
  fontPack: z.string().regex(/^[a-z][a-z0-9-]*$/).default("ds0"),       // a font pack id
  motion: z.enum(["full", "off"]).default("full"),
  background: z.enum(["rich", "subtle", "off"]).default("rich"),         // the fixed background: lines plus code glyphs
  textScale: z.number().min(0.85).max(1.4).default(1),
  // Workspaces on the home screen (the Atrium): named boards of built-in widgets, chosen and ordered by the person.
  workspaces: z.array(z.object({
    id: z.string().regex(/^[a-z][a-z0-9-]{0,30}$/),
    name: z.string().min(1).max(40),
    widgets: z.array(z.string().regex(/^[a-z][a-z0-9-]*$/).max(40)).max(16).default([]),
    modules: z.array(z.string().regex(/^[a-z][a-z0-9-]*$/).max(40)).max(40).default([]),
    pinned: z.boolean().default(false),
    // Where each widget sits on the board (a 12-column grid) and how big it is; saved when the person moves or resizes it.
    layout: z.record(z.string().regex(/^[a-z][a-z0-9-]*$/), z.object({ x: z.number().int().min(0).max(11), y: z.number().int().min(0).max(200), w: z.number().int().min(2).max(12), h: z.number().int().min(2).max(8) })).default({}),
  })).max(12).default([{ id: "main", name: "Main", widgets: ["engines", "notes", "knowledge", "backup"], modules: [], pinned: false, layout: {} }]),
  workspace: z.string().regex(/^[a-z][a-z0-9-]{0,30}$/).default("main"),
  dock: z.array(z.string()).max(12).default([]),   // nav ids pinned as shortcuts (D2)
  hidden: z.array(z.string()).default([]),         // nav ids hidden from the rail flyouts
  disabledModules: z.array(z.string().regex(/^[a-z][a-z0-9-]*$/)).default([]),
  // Modules the person switched on explicitly. A `defaultOff` module stays off until its id is here.
  enabledModules: z.array(z.string().regex(/^[a-z][a-z0-9-]*$/)).default([]),
  // Routing policy per install; "local" is the only one that can be true with no gateway configured.
  engine: z.enum(["local", "vps", "offline"]).default("local"),
  // Where the Brain lives. A setting, not an assumption: "local" needs no address, "remote" needs one
  // the person typed. No default points at the owner's Brain (R47).
  brain: z.object({
    location: z.enum(["local", "remote"]).default("local"),
    url: z.string().max(500).default(""),
  }).default({ location: "local", url: "" }),
  // Gateways the person added themselves. Empty on a fresh install (R47): no owner host is ever a default.
  gateways: z.array(z.object({
    id: z.string().regex(/^[a-z][a-z0-9-]*$/),
    name: z.string().max(60),
    url: httpUrl,
    kind: z.enum(["local", "vps"]).default("local"),
  })).max(8).default([]),
  // Model servers the person added: any OpenAI-compatible address. Each becomes an engine "server-<id>".
  modelServers: z.array(z.object({
    id: z.string().regex(/^[a-z][a-z0-9-]*$/),
    name: z.string().max(60),
    url: httpUrl,
  })).max(4).default([]),
  localOnly: z.boolean().default(false),           // "Local only": every turn stays on local engines (core/scope.ts)
  setupDone: z.boolean().default(false),
  tourDone: z.boolean().default(false),            // the one-time label tour of the desktop shell (HUD labels)
});
export const Settings = SettingsShape;
export type Settings = z.infer<typeof Settings>;

export type ModuleInfo = {
  id: string; name: string; description: string; version: string; group: string;
  edition: "owner" | "standard"; kind?: string; tags: string[];
  enabled: boolean; running: boolean; defaultOff: boolean; nav: NavEntry[];
  // False when this build's edition never starts the module (an owner module in a consumer build): its row
  // cannot be switched on, and its contributions are empty.
  available: boolean;
  // What the module may add to the shell right now (empty unless it is running; see visibleContributions).
  contributions: Contributions;
};
