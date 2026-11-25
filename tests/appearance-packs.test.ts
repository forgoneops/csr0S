// R56 and the swap test of R46: icons and fonts are packs, chosen by one setting. Each pack must be complete on its own,
// and the face rules must only fetch a subset when a character in it is used.
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadPacks, missingRoles } from "../core/packs";
import { fontFaceCss, SUBSET_RANGE } from "../web/src/packs";
import type { FontPack } from "../web/src/store";

const ROOT = join(import.meta.dir, "..");

describe("icon packs", () => {
  test("there are at least three, every one has every role and its sprite really holds the symbols", () => {
    const packs = loadPacks("icons") as unknown as { id: string; file: string; roles: string[] }[];
    expect(packs.length).toBeGreaterThanOrEqual(3);
    for (const p of packs) {
      expect({ pack: p.id, missing: missingRoles(p) }).toEqual({ pack: p.id, missing: [] });
      const svg = readFileSync(join(ROOT, "packs/icons", p.id, p.file), "utf8");
      for (const role of p.roles) expect({ pack: p.id, role, has: svg.includes(`id="i-${role}"`) }).toEqual({ pack: p.id, role, has: true });
    }
  });
  test("the three weights really differ: light is thinner than the default, bold is thicker", () => {
    const w = (id: string) => Number(/stroke-width:\s*([\d.]+)/.exec(readFileSync(join(ROOT, "packs/icons", id, "ds0-icons.svg"), "utf8"))![1]);
    expect(w("ds0-light")).toBeLessThan(w("ds0"));
    expect(w("ds0-bold")).toBeGreaterThan(w("ds0"));
  });
});

describe("font packs", () => {
  const packs = loadPacks("fonts") as unknown as (FontPack & { license: string })[];
  test("there are at least three, each carries a licence and every file it names exists inside its own folder", () => {
    expect(packs.length).toBeGreaterThanOrEqual(3);
    for (const p of packs) {
      expect(p.license).toMatch(/OFL/);
      expect(p.faces.length).toBeGreaterThan(0);
      for (const f of p.faces as { file?: string }[]) {
        expect({ pack: p.id, file: f.file, inside: !!f.file && !f.file.includes("/") && !f.file.includes("..") }).toEqual({ pack: p.id, file: f.file, inside: true });
        expect({ pack: p.id, file: f.file, exists: existsSync(join(ROOT, "packs/fonts", p.id, f.file!)) }).toEqual({ pack: p.id, file: f.file, exists: true });
      }
      for (const fam of Object.values(p.families)) expect(p.faces.some((f) => f.family === fam)).toBe(true);   // a named family is actually shipped
    }
  });
});

describe("fontFaceCss", () => {
  const pack = (faces: FontPack["faces"]) => ({ id: "t", name: "T", version: "1", license: "OFL", families: { display: "A", body: "A", mono: "A" }, fallbacks: { display: "serif", body: "serif", mono: "monospace" }, faces }) as FontPack;
  test("a face with a subset carries that subset's unicode-range; one without carries none", () => {
    const css = fontFaceCss(pack([
      { family: "A", weight: "400", style: "normal", url: "/x/a-latin.woff2", subset: "latin" },
      { family: "A", weight: "400", style: "normal", url: "/x/a-ext.woff2", subset: "latin-ext" },
      { family: "B", weight: "700", style: "normal", url: "/x/b.woff2" },
    ]));
    const rules = css.split("\n");
    expect(rules).toHaveLength(3);
    expect(rules[0]).toContain(`unicode-range:${SUBSET_RANGE.latin}`);
    expect(rules[1]).toContain(`unicode-range:${SUBSET_RANGE["latin-ext"]}`);
    expect(rules[2]).not.toContain("unicode-range");
  });
  test("the two ranges cover Polish letters between them and the Latin one covers plain ASCII", () => {
    const covers = (range: string, cp: number) => range.split(",").some((r) => { const [a, b] = r.replace("U+", "").split("-").map((x) => parseInt(x, 16)); return cp >= a && cp <= (b ?? a); });
    for (const ch of "ąćęłńóśźżĄĆĘŁŃÓŚŹŻ") expect(covers(SUBSET_RANGE["latin-ext"], ch.codePointAt(0)!) || covers(SUBSET_RANGE.latin, ch.codePointAt(0)!)).toBe(true);
    for (const ch of "Ale ma kota 0123 .,;") expect(covers(SUBSET_RANGE.latin, ch.codePointAt(0)!)).toBe(true);
    expect(covers(SUBSET_RANGE["latin-ext"], "ł".codePointAt(0)!)).toBe(true);
  });
  test("a face without a url (a pack that only names a family) emits nothing", () => {
    expect(fontFaceCss(pack([{ family: "A", weight: "400", style: "normal" }]))).toBe("");
  });
});
