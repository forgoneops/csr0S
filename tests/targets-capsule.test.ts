// The engine chip is a button: it must meet the 44 px touch target (--target) on desktop too.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("the engine chip is as tall as the touch target token, never a fixed smaller number", () => {
  const css = readFileSync(join(import.meta.dir, "..", "web", "src", "base.css"), "utf8");
  const rule = /\.engine-chip\{([^}]*)\}/.exec(css)![1];
  expect(rule).toContain("height:var(--target)");
  expect(css).toMatch(/--target:\s*44px/);
});
