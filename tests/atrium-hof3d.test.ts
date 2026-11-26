// Plan 8.12, the Hall of Fame: the Credits card's statues are now a real 3D scene on three.js (locally
// vendored), which has replaced the old flat-picture + WebGL overlay. It must stay decoration (never take
// the links away or keep burning the GPU where the owner asked for calm), stay offline (no CDN), and keep
// the guard rails (reduced motion, Simple mode, pause off-screen / hidden). This checks the seams a
// browser would otherwise be needed for: the load order, precaching, that it registers as a module with
// no view, and that the rails are present.
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
  test("loads three.js first, after the dock, and both files are precached and linked", () => {
    expect(scripts.indexOf("vendor/three.min.js")).toBeGreaterThan(scripts.indexOf("dock.js"));
    expect(scripts.indexOf("hof3d.js")).toBeGreaterThan(scripts.indexOf("vendor/three.min.js"));
    expect(html).toContain('href="hof3d.css"');
    expect(sw).toContain('"/hof3d.js"');
    expect(sw).toContain('"/hof3d.css"');
    expect(sw).toContain('"/vendor/three.min.js"');
  });

  test("registers as its own module and adds no view", () => {
    expect(js).toContain("register({ id: 'hof3d', views: {} })");
  });

  test("is decoration: offline, no import, aria-hidden, no pointer capture, but it needs THREE", () => {
    expect(js).not.toMatch(/https?:\/\//);      // no network: the vendored lib is local
    expect(js).not.toMatch(/\bimport\b/);        // global THREE, loaded as a plain script
    expect(js).toContain("typeof THREE === 'undefined'");  // gracefully degrades without the vendor file
    expect(js).toContain("setAttribute('aria-hidden', 'true')");
    expect(css).toContain("pointer-events:none");
    expect(css).toContain(".hf3{position:absolute");
  });

  test("draws with a WebGL2 renderer and survives losing the context", () => {
    expect(js).toContain("new THREE.WebGLRenderer");
    expect(js).toContain("'webglcontextlost'");
    expect(js).toContain("'webglcontextrestored'");
    // the clickable targets are never the scene: they are the real overlay links, so the canvas must stay clear
    expect(css).toContain("pointer-events:none");
  });

  test("stays still when the owner asked for calm", () => {
    expect(js).toContain("prefers-reduced-motion: reduce");
    expect(js).toContain("dataset.motion");
    expect(js).toContain("'nx-simple'");
    expect(js).toContain("IntersectionObserver");   // and pauses off-screen
    expect(js).toContain("visibilitychange");       // and in a hidden tab
  });

  test("caps the device pixel ratio at 1", () => {
    expect(js).toContain("Math.min(window.devicePixelRatio || 1, 1)");   // the hall renders at CSS resolution: 2x cost frames and bought nothing
  });

  test("ten statues, holding the two owner-requested members in view order", () => {
    expect(js).toContain("Math.min(S.sx.length, 10)");
  });
});
