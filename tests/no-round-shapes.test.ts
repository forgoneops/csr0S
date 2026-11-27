// Owner, 2026-11-23: no round shapes, no rounded-card "every app looks the same" look. CaesarOS uses cut corners (clip-path) and pixel squares.
// The Atrium styles carry no border-radius at all except the old shared sheet (real.css), which switches every radius off under the CaesarOS theme.
import { expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = join(import.meta.dir, "..", "web", "atrium");
const css = readdirSync(DIR).filter((f) => f.endsWith(".css"));

test("only the old shared sheet may mention a radius, and it zeroes every one under the CaesarOS theme", () => {
  for (const f of css) {
    if (f === "real.css") continue;
    const rounded = [...readFileSync(join(DIR, f), "utf8").matchAll(/border-radius:\s*([^;}]+)/g)].map((m) => m[1].trim()).filter((v) => !/^(0|0px|none)\b/.test(v));
    expect({ file: f, rounded }).toEqual({ file: f, rounded: [] });
  }
  expect(readFileSync(join(DIR, "real.css"), "utf8")).toContain("html[data-theme=caesaros] *,html[data-theme=caesaros] :before,html[data-theme=caesaros] :after{border-radius:0!important}");
});

test("no script draws a round shape inline", () => {
  for (const f of readdirSync(DIR).filter((x) => x.endsWith(".js") || x === "index.html")) {
    const src = readFileSync(join(DIR, f), "utf8");
    expect({ file: f, round: /border-radius:\s*(50%|9{3}px)/.test(src) }).toEqual({ file: f, round: false });
  }
});
