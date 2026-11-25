// Gate R46: packs are complete and swappable. An icon pack must define every role in the contract, a
// theme must carry the tokens the shell and the background read, and a font pack must ship its faces.
import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ICON_ROLES, missingRoles, loadPacks, packIndex } from "../core/packs";

const ROOT = join(import.meta.dir, "..");

describe("packs", () => {
  test("every icon pack defines every role, and its sprite really has the symbols", () => {
    const packs = loadPacks("icons");
    expect(packs.length).toBeGreaterThan(0);
    for (const pack of packs) {
      const icon = pack as unknown as { id: string; roles: string[]; file: string };
      expect({ id: icon.id, missing: missingRoles(icon) }).toEqual({ id: icon.id, missing: [] });
      const svg = readFileSync(join(ROOT, "packs/icons", icon.id, icon.file), "utf8");
      const declaredButMissing = icon.roles.filter((role) => !svg.includes(`id="i-${role}"`));
      expect({ id: icon.id, declaredButMissing }).toEqual({ id: icon.id, declaredButMissing: [] });
      expect(ICON_ROLES.length).toBe(54);
    }
  });

  test("every theme carries the tokens the shell and the background read", () => {
    const themes = loadPacks("themes");
    expect(themes.length).toBeGreaterThanOrEqual(2);
    for (const theme of themes) {
      const t = theme as unknown as { id: string; css: string };
      const css = readFileSync(join(ROOT, "packs/themes", t.id, t.css), "utf8");
      for (const token of ["--bg", "--surface", "--ink", "--accent", "--accent-2", "--signal", "--danger", "--cut"]) {
        expect({ theme: t.id, token, present: css.includes(`${token}:`) }).toEqual({ theme: t.id, token, present: true });
      }
      expect(css).toContain("--signal:var(--accent-2)");
    }
  });

  test("every font pack ships the faces it lists and names three families", () => {
    const packs = loadPacks("fonts");
    expect(packs.length).toBeGreaterThan(0);
    for (const pack of packs) {
      const f = pack as unknown as { id: string; families: Record<string, string>; faces: { file?: string }[] };
      expect(Object.keys(f.families).sort()).toEqual(["body", "display", "mono"]);
      for (const face of f.faces) if (face.file) expect(existsSync(join(ROOT, "packs/fonts", f.id, face.file))).toBe(true);
    }
  });

  test("the index resolves every URL the browser needs, and no pack points outside packs/", () => {
    const index = packIndex();
    for (const p of index.icons as { id: string; file: string; url: string }[]) expect(p.url).toBe(`/packs/icons/${p.id}/${p.file}`);
    for (const p of index.themes as { id: string; css: string; url: string }[]) expect(p.url).toBe(`/packs/themes/${p.id}/${p.css}`);
    for (const p of index.fonts) for (const face of p.faces) if (face.url) expect(face.url.startsWith(`/packs/fonts/${p.id}/`)).toBe(true);
    expect(index.themes.map((t) => t.id).sort()).toEqual(["cinder", "lumen", "neo-roma"]);
  });

  test("a pack with a broken manifest is skipped, not guessed at (the real loader, on a temporary packs folder)", () => {
    const root = mkdtempSync(join(tmpdir(), "caesaros-packs-"));
    const themes = join(root, "themes");
    const make = (id: string, manifest: string | null) => { mkdirSync(join(themes, id), { recursive: true }); if (manifest !== null) writeFileSync(join(themes, id, "manifest.json"), manifest); };
    const good = JSON.parse(readFileSync(join(import.meta.dir, "..", "packs", "themes", "cinder", "manifest.json"), "utf8"));
    make("good", JSON.stringify(good));
    make("notjson", "{ this is not json");
    make("wrongshape", JSON.stringify({ name: 7 }));
    make("nomanifest", null);
    const seen: string[] = [];
    const orig = console.error; console.error = (...a: unknown[]) => { seen.push(String(a[0])); };
    try {
      expect(loadPacks("themes", root).map((p) => p.id)).toEqual(["good"]);
    } finally { console.error = orig; }
    expect(seen.filter((m) => m.includes("notjson") && m.includes("not JSON"))).toHaveLength(1);
    expect(seen.filter((m) => m.includes("wrongshape") && m.includes("invalid manifest"))).toHaveLength(1);
    expect(loadPacks("themes", join(root, "missing"))).toEqual([]);
  });

  test("a theme's palettes are data: valid colours, unique ids, and the default theme ships a default palette first", () => {
    for (const theme of loadPacks("themes") as unknown as { id: string; palettes: { id: string; p1: string; p2: string }[] }[]) {
      const ids = theme.palettes.map((p) => p.id);
      expect({ theme: theme.id, unique: new Set(ids).size === ids.length }).toEqual({ theme: theme.id, unique: true });
      for (const p of theme.palettes) expect([p.p1, p.p2].every((c) => /^#[0-9a-f]{6}$/i.test(c))).toBe(true);
    }
    const neo = (loadPacks("themes") as unknown as { id: string; palettes: { id: string }[] }[]).find((t) => t.id === "neo-roma")!;
    expect(neo.palettes.length).toBe(10);
    expect(neo.palettes[0].id).toBe("ember");             // ember and cyan is the default (decision of 2026-11-22)
  });

  test("the contract: an icon pack that lacks roles is reported role by role", () => {
    expect(missingRoles({ roles: ["chat"] }).length).toBe(53);
  });
});
