// Regression for "you cannot leave the split / the halves do not resize". Source-level guards; the real-browser run is tools/split-check.ts.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const A = join(import.meta.dir, "..", "web", "atrium");
const og = readFileSync(join(A, "og.js"), "utf8"), html = readFileSync(join(A, "index.html"), "utf8"), css = readFileSync(join(A, "og.css"), "utf8");

test("every way into the split folds into one state with one exit", () => {
  expect(og).toContain("function ogEnter()");
  expect(html).toContain("if(S.split&&!OGS.sp.on&&!phone()) ogEnter();"); // the dock's S.split flag and a restored one
  expect(og).toContain("if (OGS.sp.on || S.split) { OGS.sp.on = false; S.split = false; }"); // the toolbar button toggles off from either
  expect(og).toContain("else if (k === 'off') { sp.on = false; S.split = false; }");
});
test("an obvious Exit split control and Esc are always in split mode", () => {
  expect(og).toContain('aria-label="Exit split"');
  expect(og).toMatch(/e\.key !== 'Escape'[^\n]*\n[^\n]*sp\.menu != null/);
});
test("the ratio is a CSS variable, so a re-render keeps it; the edge is wide, labelled and keyboard reachable", () => {
  expect(og).toContain("--r:${sp.ratio}");
  expect(og).not.toMatch(/gridTemplateColumns = r/);
  expect(og).toContain('role="separator" tabindex="0"');
  expect(og).toContain("pointerdown");
  expect(css).toMatch(/\.og-gut\.col\{[^}]*width:16px/);
  expect(og).toMatch(/Math\.min\(80, Math\.max\(20/);
});
