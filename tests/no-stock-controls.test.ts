// Rule (Konrad): no browser-native select, details, dialog or alert in the UI. The app draws its own controls so
// they follow the theme and behave the same on desktop and phone. (A styled range slider is allowed, and the install
// prompt object of a PWA, `event.prompt()`, is not window.prompt.)
import { expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(p) ? [p] : []; });

test("web/src uses none of the stock controls", () => {
  const bad = walk(join(import.meta.dir, "..", "web", "src")).flatMap((f) => {
    const src = readFileSync(f, "utf8");
    return [/<select[\s>]/, /<details[\s>]/, /<dialog[\s>]/, /(?<![.\w])(alert|confirm|prompt)\(|\bwindow\.(alert|confirm|prompt)\(/].filter((re) => re.test(src)).map((re) => `${f}: ${re}`);
  });
  expect(bad).toEqual([]);
});
