import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join(import.meta.dir, "..", "web", "atrium");
const css = readFileSync(join(DIR, "kit.css"), "utf8");
// --cur-x:image-set(url(cursors/N.png) 1x,url(cursors/N@2x.png) 2x) HX HY,keyword
const defs = [...css.matchAll(/--cur-[\w-]+:image-set\(url\(cursors\/([\w-]+)\.png\) 1x,url\(cursors\/([\w-]+)@2x\.png\) 2x\) (\d+) (\d+),([\w-]+)/g)];
const size = (f: string) => { const b = readFileSync(f); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

test("kit.css maps all 22 cursors, each with a 1x and a 2x image and a system fallback", () => {
  expect(defs.length).toBe(22);
  expect((css.match(/--cur-[\w-]+:/g) || []).length).toBe(22);
});

test("every cursor file exists at 24x24 and 48x48 and the hotspot lies inside the image", () => {
  for (const [, n, n2, x, y] of defs) {
    expect(n2).toBe(n);
    for (const [f, s] of [[`${n}.png`, 24], [`${n}@2x.png`, 48]] as const) {
      const p = join(DIR, "cursors", f);
      expect(existsSync(p)).toBe(true);
      expect(size(p)).toEqual([s, s]);
    }
    expect(+x).toBeGreaterThanOrEqual(0); expect(+x).toBeLessThan(24);
    expect(+y).toBeGreaterThanOrEqual(0); expect(+y).toBeLessThan(24);
  }
});

test("the global rules and the grip, canvas and board rules are in place", () => {
  expect(css).toContain("html body,html body *{cursor:var(--cur-arrow)!important}");
  for (const k of ["--cur-ns)", "--cur-ew)", "--cur-nwse)", "--cur-nesw)", "--cur-grab)", "--cur-no)"]) expect(css).toContain(`cursor:var(${k}!important`);
  for (const sel of [".cdk-grip", ".nt-gc", ".bd-wall", ".md-stage"]) expect(css).toContain(sel);
});

test("the shell's hotspots are the ones the cursor source draws to", () => {
  const src = join(import.meta.dir, "..", "tools", "cursors", "make-cursors.py");
  const run = Bun.spawnSync(["python3", "-B", "-c", "import json,runpy,sys; print(json.dumps(runpy.run_path(sys.argv[1])['HOT']))", src]);
  const hot = JSON.parse(run.stdout.toString()) as Record<string, [number, number]>;
  expect(Object.keys(hot).sort()).toEqual(defs.map((d) => d[1]!).sort());
  for (const [, n, , x, y] of defs) expect([n, +x!, +y!]).toEqual([n, ...hot[n!]!]);
});
