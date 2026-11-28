// Phone layout guards (the real hit test and layout need a browser; these keep the rules that fixed measured defects at 390 px):
// the workspace strip stays hidden on a phone (a later kit.css rule had won it back as a 56 px window), a phone held sideways
// loses the status bar, the chat chips scroll in one row, and the page declares itself installable on iOS too.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(import.meta.dir, "..", "web", "atrium");
const kit = readFileSync(join(dir, "kit.css"), "utf8");
const html = readFileSync(join(dir, "index.html"), "utf8");

test("the workspace strip is hidden on a phone by the stylesheet that loads last", () => {
  expect(kit).toContain("@media (max-width:480px){html body .ws-bar{display:none}}");
});
test("a phone held sideways drops the status bar", () => {
  expect(kit).toMatch(/@media \(max-height:500px\) and \(pointer:coarse\)\{\s*\.shell\.atrium \.live-bar\{display:none\}/);
});
test("the chat option chips are one scrolling row on a phone", () => {
  expect(kit).toMatch(/@media \(max-width:760px\)\{\s*\.nx-ctx\{flex-wrap:nowrap;overflow-x:auto/);
});
test("the page is installable on iOS and Android", () => {
  for (const m of ["mobile-web-app-capable", "apple-mobile-web-app-capable", "apple-mobile-web-app-title"]) expect(html).toContain(`name="${m}"`);
});
