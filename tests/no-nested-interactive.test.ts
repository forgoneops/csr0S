// A control inside another control is invalid and swallows taps and keys. The shell used a span with
// role="button" inside a button for the pin; siblings are the rule now.
import { expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : p.endsWith(".tsx") ? [p] : []; });

test("no element fakes a button with role=button; real buttons only", () => {
  const bad = walk(join(import.meta.dir, "..", "web", "src")).filter((f) => /role="button"/.test(readFileSync(f, "utf8")));
  expect(bad).toEqual([]);
});
