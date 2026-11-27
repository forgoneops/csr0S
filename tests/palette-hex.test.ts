// New hardcoded accent colours must not creep back into the Atrium. The Neo Roma accents (ember, ice, gold, magenta, violet...)
// come from the tokens --p1 --p2 --gold, so a literal of one of them outside a var() fallback, a palette definition or art is debt.
// Files below are frozen at today's count: they define palettes or world colours on purpose. Lower a number when you fix one, never raise it.
import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join(import.meta.dir, "..", "web", "atrium");
const ACCENT = /#(?:ff8a3d|33e8ff|f2c46b|ff3fd0|ff38b8|ff7a3d|b04dff|a45cff)\b|rgba?\(\s*(?:255,\s*138,\s*61|232,\s*169,\s*74|127,\s*217,\s*255|51,\s*232,\s*255|242,\s*196,\s*107)/gi;
// a literal as the fallback of var(--token, ...) or of a token read in script is safe: the token wins
const FALLBACK = /(?:var\(\s*--[\w-]+\s*,\s*(?:var\(\s*--[\w-]+\s*,\s*)?|getPropertyValue\([^)]*\)(?:\.trim\(\))?\s*\|\|\s*|\btok\([^,]*,\s*|\bv\([^,]*,\s*)['"]?(?:#[0-9a-f]{3,8}|rgba?\([^)]*\))/gi;

const ALLOWED: Record<string, number> = {
  "neo.css": 14,           // the palette definitions themselves
  "ns.js": 13,             // the palette picker swatches
  "real.css": 3,           // tint and status definitions
  "theme-neutral.css": 99, // its own palette (exempt)
  "hof3d.js": 99,          // the 3D scene's world colours (exempt)
  "art.js": 99,            // art (exempt)
};

test("no new hardcoded accent colour outside the allow-list", () => {
  const over: string[] = [];
  for (const f of readdirSync(DIR).filter((x) => /\.(css|js|html)$/.test(x))) {
    const n = readFileSync(join(DIR, f), "utf8").split("\n").reduce((a, l) => a + (l.replace(FALLBACK, "").match(ACCENT)?.length ?? 0), 0);
    if (n > (ALLOWED[f] ?? 0)) over.push(`${f}: ${n} > ${ALLOWED[f] ?? 0}`);
  }
  expect(over).toEqual([]);
});
