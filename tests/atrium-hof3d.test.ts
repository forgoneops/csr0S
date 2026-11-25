// Plan 8.12, the Hall of Fame in WebGL: the Credits card's statues are a still picture, so the layer
// that makes them alive is decoration over it — raw WebGL2, no library, and it must never take the
// links away or keep running where the owner asked for calm. This checks the seams a browser would
// otherwise be needed for: where the file loads, that the worker precaches it, that it is a module
// with no view, and that the guard rails (reduced motion, Simple mode, context loss) are present.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ATRIUM = join(import.meta.dir, "..", "web", "atrium");
const html = readFileSync(join(ATRIUM, "index.html"), "utf8");
const sw = readFileSync(join(ATRIUM, "sw.js"), "utf8");
const js = readFileSync(join(ATRIUM, "hof3d.js"), "utf8");
const css = readFileSync(join(ATRIUM, "hof3d.css"), "utf8");

const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);

describe("Hall of Fame WebGL layer", () => {
  test("loads after the dock, and both files are precached and linked", () => {
    expect(scripts.indexOf("hof3d.js")).toBeGreaterThan(scripts.indexOf("dock.js"));
    expect(html).toContain('href="hof3d.css"');
    expect(sw).toContain('"/hof3d.js"');
    expect(sw).toContain('"/hof3d.css"');
  });

  test("registers as its own module and adds no view", () => {
    expect(js).toContain("register({ id: 'hof3d', views: {} })");
  });

  test("is decoration: no library, no network, aria-hidden, no pointer capture", () => {
    expect(js).not.toMatch(/https?:\/\//);
    expect(js).not.toMatch(/\bimport\b/);
    expect(js).toContain("setAttribute('aria-hidden', 'true')");
    expect(css).toContain("pointer-events:none");
    expect(css).toContain(".hf3{position:absolute");
  });

  test("draws with WebGL2 and survives losing the context", () => {
    expect(js).toContain("getContext('webgl2'");
    expect(js).toContain("'webglcontextlost'");
    expect(js).toContain("'webglcontextrestored'");
  });

  test("stays still when the owner asked for calm", () => {
    expect(js).toContain("prefers-reduced-motion: reduce");
    expect(js).toContain("dataset.motion");
    expect(js).toContain("'nx-simple'");
    expect(js).toContain("IntersectionObserver");   // and pauses off-screen
    expect(js).toContain("visibilitychange");       // and in a hidden tab
  });

  test("caps the device pixel ratio at 2", () => {
    expect(js).toContain("Math.min(window.devicePixelRatio || 1, 2)");
  });
});
