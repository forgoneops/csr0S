// The fixed line field (background.js) and the code layer (ascii.js) must always reach the page: both scripts are
// loaded before the inline shell script, the shell attaches the canvas, and with NO WebGL the 2D fallback still
// attaches a visible canvas plus a glyph layer. Runs the real files against a tiny DOM stub.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ATRIUM = join(import.meta.dir, "..", "web", "atrium");
const html = readFileSync(join(ATRIUM, "index.html"), "utf8");
const sw = readFileSync(join(ATRIUM, "sw.js"), "utf8");
const read = (f: string) => readFileSync(join(ATRIUM, f), "utf8");

describe("background and ASCII layers in the page", () => {
  test("both scripts are linked before the shell script, and precached", () => {
    const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
    expect(scripts).toContain("background.js");
    expect(scripts.indexOf("ascii.js")).toBeGreaterThanOrEqual(0);
    expect(scripts.indexOf("ascii.js")).toBeLessThan(scripts.indexOf("background.js"));
    expect(html.indexOf('<script src="background.js">')).toBeLessThan(html.indexOf("window.caesarosThemeBackground(bgc"));
    expect(sw).toContain('"/background.js"');
    expect(sw).toContain('"/ascii.js"');
  });

  test("the shell attaches the canvas to the body and starts the background", () => {
    expect(html).toMatch(/bgc\.className='bg-canvas'/);
    expect(html).toContain("document.body.prepend(bgc)");
    expect(html).toContain("window.caesarosThemeBackground(bgc");
  });

  test("without WebGL the 2D fallback still attaches a lit canvas and a glyph layer", () => {
    const made: any[] = [], ctx2d: string[] = [];
    const mk = (tag: string) => {
      const el: any = { tag, className: "", width: 0, height: 0, classList: { add(c: string) { el.className += " " + c; } }, attrs: {},
        setAttribute(k: string, v: string) { el.attrs[k] = v; }, after(n: any) { made.push(n); }, remove() {}, replaceWith() {}, addEventListener() {},
        getContext: (t: string) => { if (t !== "2d") { el.poisoned = true; return null; } return el.poisoned ? null : // like Chrome: a canvas that refused webgl2 gives no 2d either
          (ctx2d.push(el.className), new Proxy({}, { get: (_o, k) => (k === "measureText" ? () => ({ width: 6 }) : () => {}), set: () => true })); } };
      return el;
    };
    const g: any = globalThis;
    const keep = { window: g.window, document: g.document, matchMedia: g.matchMedia, addEventListener: g.addEventListener, innerWidth: g.innerWidth, innerHeight: g.innerHeight, devicePixelRatio: g.devicePixelRatio, MutationObserver: g.MutationObserver, requestAnimationFrame: g.requestAnimationFrame, getComputedStyle: g.getComputedStyle };
    try {
      g.window = g; g.devicePixelRatio = 1; g.innerWidth = 1440; g.innerHeight = 900; g.matchMedia = () => ({ matches: false, addEventListener() {} });
      g.addEventListener = () => {}; g.requestAnimationFrame = () => 0; g.MutationObserver = class { observe() {} };
      g.getComputedStyle = () => ({ getPropertyValue: (k: string) => (k === "--p1" ? "#ff8a3d" : "#33e8ff") });
      g.document = { documentElement: { dataset: { theme: "caesaros", motion: "on" } }, createElement: mk, hidden: false, fonts: { load: () => Promise.resolve() } };
      new Function(read("ascii.js"))(); new Function(read("background.js"))();
      const canvas = mk("canvas"); g.caesarosThemeBackground(canvas, { animate: () => true });
      expect(canvas.className).toContain("bg-2d");
      expect(made.some((c) => c.className.includes("bg-ascii"))).toBe(true);
      expect(ctx2d.some((c) => c.includes("bg-ascii"))).toBe(true); // the glyph layer got a working 2D context
    } finally { Object.assign(g, keep); }
  });

  test("the 2D lines are not dimmed again by the shell opacity", () => {
    expect(html).toMatch(/\.bg-canvas\.bg-2d\{\s*opacity:\.9/);
  });
});
