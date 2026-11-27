// The phone drawer lives inside .shell, the scrim outside it. While the drawer is open .shell must not form its own
// stacking context, or every menu tap lands on the scrim. (The real hit test needs a browser; this guards the rule.)
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("an open phone drawer is not trapped under the scrim", () => {
  const css = readFileSync(join(import.meta.dir, "..", "web", "atrium", "ns.css"), "utf8");
  expect(css).toContain("html body .shell:has(.ns-wrap.open){z-index:auto;isolation:auto}");
});
