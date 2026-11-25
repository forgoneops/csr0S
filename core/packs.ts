// Packs: icons, fonts, themes. Every pack is a folder under packs/<kind>/<id>/ with a manifest, and the
// app reads the manifest, never a file path (R46). A component asks for an icon by ROLE; a theme is a
// token stylesheet; a font pack is a set of families. Swapping one is a setting.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { ROOT } from "./root";

export const PACK_KINDS = ["icons", "fonts", "themes"] as const;
export type PackKind = (typeof PACK_KINDS)[number];

/** The role contract (docs/design/DS0-ICON-ROLES.md). A pack must define every one of these. */
export const ICON_ROLES = [
  "chat", "terminal", "motion", "board", "memory", "skills", "media", "folder", "mail", "calendar",
  "crew", "agent", "engine", "wave", "laurel", "settings", "search", "command", "add", "remove",
  "close", "check", "chevron-down", "chevron-right", "chevron-up", "more", "menu", "pane", "split", "send",
  "mic", "attach", "copy", "edit", "delete", "refresh", "play", "pause", "power", "lock",
  "eye", "link", "external", "filter", "alert", "info", "clock", "download", "upload", "tag",
  "sort", "pin", "globe", "theme",
] as const;
export type IconRole = (typeof ICON_ROLES)[number];

const IconPack = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/), name: z.string(), version: z.string(), license: z.string(),
  file: z.string().regex(/^[\w.-]+\.svg$/),
  roles: z.array(z.string()).default([]),
  source: z.string().optional(),
});
const FontPack = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/), name: z.string(), version: z.string(), license: z.string(),
  families: z.object({ display: z.string(), body: z.string(), mono: z.string() }),
  fallbacks: z.object({ display: z.string(), body: z.string(), mono: z.string() }).default({ display: "serif", body: "sans-serif", mono: "monospace" }),
  faces: z.array(z.object({ family: z.string(), file: z.string().optional(), weight: z.string().default("400"), style: z.string().default("normal"), subset: z.enum(["latin", "latin-ext"]).optional() })).default([]),
  href: z.string().optional(),           // a stylesheet the pack asks the browser to load (only ever the pack's own choice)
  source: z.string().optional(),
});
const ThemePack = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/), name: z.string(), version: z.string(), license: z.string(),
  css: z.string().regex(/^[\w.-]+\.css$/),
  // Colour pairs the person can pick in Settings: p1 leads, p2 answers. Data, so a palette is added without code.
  palettes: z.array(z.object({ id: z.string().regex(/^[a-z][a-z0-9-]*$/), name: z.string().max(30), p1: z.string().regex(/^#[0-9a-fA-F]{6}$/), p2: z.string().regex(/^#[0-9a-fA-F]{6}$/) })).max(16).default([]),
  description: z.string().optional(),
  source: z.string().optional(),
});

export type PackInfo =
  | ({ kind: "icons" } & z.infer<typeof IconPack>)
  | ({ kind: "fonts" } & z.infer<typeof FontPack>)
  | ({ kind: "themes" } & z.infer<typeof ThemePack>);

const PACKS = join(ROOT, "packs");
const SCHEMA = { icons: IconPack, fonts: FontPack, themes: ThemePack } as const;

/** Every pack of one kind that has a valid manifest. A broken manifest is reported, never guessed at. */
export function loadPacks(kind: PackKind, root: string = PACKS): PackInfo[] {
  const dir = join(root, kind);
  if (!existsSync(dir)) return [];
  const out: PackInfo[] = [];
  for (const id of readdirSync(dir).sort()) {
    const file = join(dir, id, "manifest.json");
    if (!existsSync(file)) continue;
    let raw: unknown;
    try { raw = JSON.parse(readFileSync(file, "utf8")); } catch (e) { console.error(`pack ${kind}/${id}: manifest is not JSON: ${(e as Error).message}`); continue; }
    const parsed = SCHEMA[kind].safeParse({ ...(raw as object), id });
    if (!parsed.success) { console.error(`pack ${kind}/${id}: invalid manifest`, parsed.error.issues); continue; }
    out.push({ kind, ...parsed.data } as PackInfo);
  }
  return out;
}

/** What the app may show: every pack, with the URLs a browser needs, resolved here so no component
 *  builds a path itself. */
export function packIndex() {
  const icons = loadPacks("icons").map((p) => ({ ...p, url: `/packs/icons/${p.id}/${(p as { file: string }).file}` }));
  const fonts = loadPacks("fonts").map((p) => ({ ...p, faces: (p as { faces: { file?: string }[] }).faces.map((f) => ({ ...f, url: f.file ? `/packs/fonts/${p.id}/${f.file}` : undefined })) }));
  const themes = loadPacks("themes").map((p) => ({ ...p, url: `/packs/themes/${p.id}/${(p as { css: string }).css}` }));
  return { icons, fonts, themes };
}

/** Does this icon pack define every role the contract names? A missing role is a pack error, not a blank. */
export function missingRoles(pack: { roles: string[] }): string[] {
  const has = new Set(pack.roles);
  return ICON_ROLES.filter((r) => !has.has(r));
}
