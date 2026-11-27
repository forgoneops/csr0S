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
  test("one painted plate that exists, two mirrored statues make ten keepers, no network, WebGL2 only", () => {
    expect(js).toContain("const ART = 'art/caesaros-thanks-statues.webp';");
    expect(existsSync(join(ATRIUM, "art", "caesaros-thanks-statues.webp"))).toBe(true);
    const bounds = JSON.parse(js.match(/const BOUNDS = (\[[\d, ]+\]);/)![1]);
    expect(bounds.length).toBe(11);
    expect(bounds.every((b: number, i: number) => i === 0 || b > bounds[i - 1])).toBe(true);
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
  test("tilt, parallax, torch light, lift and ASCII shading are present", () => {
    for (const k of ["deviceorientation", "uLift", "uGlyph", "uPar", "uTorch", "heightMap"]) expect(js).toContain(k);
  });
});

describe("Hall of Fame depth map", () => {
  test("heightMap lifts a bright body above dark floor and keeps normals finite", () => {
    const m = js.indexOf("function blur("), e = js.indexOf("/* the plate canvas");
    const K = new Function(js.slice(m, e) + "; return { heightMap };")() as any;
    const w = 40, h = 40, px = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = x > 12 && x < 28 && y > 6 && y < 34 ? 120 : 4, i = (y * w + x) * 4; px[i] = px[i + 1] = px[i + 2] = v; px[i + 3] = 255; }
    const r = K.heightMap(px, w, h);
    expect(r.depth[20 * w + 20]).toBeGreaterThan(r.depth[20 * w + 3] + 0.2);
    expect(r.mask[20 * w + 20]).toBeGreaterThan(0.9);
    expect(r.nx.every(Number.isFinite) && r.ny.every(Number.isFinite)).toBe(true);
  });
});
