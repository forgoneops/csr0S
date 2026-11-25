// Gate R46, second half: no component imports an icon or a font file. The UI asks for a role, and the
// pack layer is the only place that touches an asset.
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dir, "..");
const SRC = join(ROOT, "web", "src");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? files(p) : [p]; });
}

const ASSET = /import[^;]*\.(svg|woff2?|ttf|otf|png|webp)["']/;
const ALLOWED = ["web/src/packs.ts"]; // the one layer allowed to know a pack URL

describe("no direct asset imports", () => {
  test("no component imports an icon, font or image file", () => {
    const hits = files(SRC)
      .filter((f) => /\.(ts|tsx)$/.test(f))
      .filter((f) => !ALLOWED.includes(relative(ROOT, f)))
      .filter((f) => ASSET.test(readFileSync(f, "utf8")))
      .map((f) => relative(ROOT, f));
    expect(hits).toEqual([]);
  });

  test("no component writes a /packs/ path itself", () => {
    const hits = files(SRC)
      .filter((f) => /\.(ts|tsx)$/.test(f))
      .filter((f) => !ALLOWED.includes(relative(ROOT, f)))
      .filter((f) => /["'`]\/packs\//.test(readFileSync(f, "utf8")))
      .map((f) => relative(ROOT, f));
    expect(hits).toEqual([]);
  });

  test("the sprite is loaded by the pack layer, by the pack's own URL", () => {
    const packs = readFileSync(join(SRC, "packs.ts"), "utf8");
    expect(packs).toContain("loadSprite");
    expect(packs).toContain("pack.url");
  });
});
