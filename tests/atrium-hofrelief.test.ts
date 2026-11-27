// Hall of Fame, relief style (opt-in via localStorage 'hof-style' = 'relief'): the seams a browser would otherwise be needed for.
import { describe, expect, test } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ATRIUM = join(import.meta.dir, "..", "web", "atrium");
const read = (f: string) => readFileSync(join(ATRIUM, f), "utf8");
const js = read("hofrelief.js"), hof3d = read("hof3d.js"), html = read("index.html"), sw = read("sw.js");

describe("Hall of Fame relief style", () => {
  test("is the only Hall style: the standing-statue renderer steps aside, no style switch remains", () => {
    expect(js).not.toContain("register({");
    expect(js).toContain("const isOn = () => true;");
    expect(hof3d).toContain("const relief = () => true;");
    expect(read("settings.js")).not.toContain("hofstyle:");
    expect(html.indexOf("hofrelief.js")).toBeGreaterThan(html.indexOf("vendor/three.min.js"));
    expect(sw).toContain('"/hofrelief.js"');
  });
  test("uses painted art that exists, ten distinct sources, no network, WebGL2 only", () => {
    const names = [...js.matchAll(/\['(caesaros-[a-z-]+)', \d/g)].map((m) => m[1]);
    expect(new Set(names).size).toBe(10);
    for (const n of names) expect(existsSync(join(ATRIUM, "art", n + ".webp"))).toBe(true);
    expect(js).not.toMatch(/https?:\/\//);
    expect(js).toContain("getContext('webgl2'");
  });
  test("keeps HF3, the legend, calm mode, pause rails and token colours", () => {
    expect(js).toContain("window.HF3 = myHF3");
    expect(js).toContain("hf-card");
    expect(js).toContain("prefers-reduced-motion: reduce");
    expect(js).toContain("'nx-simple'");
    expect(js).toContain("IntersectionObserver");
    expect(js).toContain("visibilitychange");
    expect(js).toContain("'webglcontextlost'");
    for (const t of ["--p1", "--p2", "--gold", "--tint-magenta"]) expect(js).toContain(t);
  });
  test("tilt, pan, lift and ASCII shading are present", () => {
    for (const k of ["deviceorientation", "uLift", "uGlyph", "dFdx", "heightMap"]) expect(js).toContain(k);
  });
});
