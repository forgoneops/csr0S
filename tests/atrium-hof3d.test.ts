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
    // destroy() drops its own context on a style switch; that late event must not mark the next hall as lost
    expect(js).toContain("if (S.cv !== cv) return; e.preventDefault(); S.lost = true;");
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

  test("renders to a pixel budget: the wide desktop hall stays at 1x, a small phone hall may reach 2x", () => {
    expect(js).toContain("Math.max(1, Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(480000 / (hb.width * hb.height))))");
  });

  test("ten keepers in view order, and Caesar as the eleventh statue in the middle bay", () => {
    expect(js).toContain("function general(i, ux)");
    expect(js).toContain("for (let i = 0; i <= CAESAR; i++) {\n      const st = general(i, HX(i));");   // keepers 0..9 placed by index, index 10 is Caesar
    expect(js).toContain("(i === CAESAR ? 0 :");
  });

  // Regression: the hall used to die on mount with "Cannot set properties of undefined (setting 'hfPaint')". three r128
  // textures have NO userData (materials and objects do), so a palette repaint hook parked there threw inside the
  // MutationObserver callback and the whole Credits hall never built. The hook now lives on the texture itself.
  test("palette repaint hooks never use texture.userData (r128 textures have none)", () => {
    expect(js).not.toMatch(/\.userData\.hfPaint/);
    expect(js).toContain("t.hfPaint = paint");
    const three = readFileSync(join(ATRIUM, "vendor", "three.min.js"), "utf8");
    const THREE = new Function("window", "self", `${three}; return typeof THREE !== 'undefined' ? THREE : this.THREE;`).call({}, {}, {}) as any;
    expect(new THREE.Texture().userData).toBeUndefined();            // the trap itself
    expect(new THREE.MeshStandardMaterial().userData).toEqual({});    // where per-material flags may live
  });

  test("the sculptor runs without the DOM and returns a closed, lit mesh", async () => {
    const m = js.indexOf("function hofKernel()"), e = js.indexOf("  /* ---------------- the keepers on screen");
    expect(m).toBeGreaterThan(0);
    const K = new Function(js.slice(m, e) + "; return hofKernel();")() as any;
    const r = K.build(3, 0.012);
    expect(r.pos.length / 3).toBeGreaterThan(2000);
    expect(r.idx.length % 3).toBe(0);
    expect(r.nor.length).toBe(r.pos.length);
    expect(r.ao.length).toBe(r.pos.length / 3);
    expect(Math.max(...r.idx)).toBeLessThan(r.pos.length / 3);
    expect(Math.min(...r.ao)).toBeGreaterThanOrEqual(0);
    expect(r.cv.length).toBe(r.ao.length);   // curvature, for the polished bevels
  });

  // the trademark is Caesar's alone: the faceted crystal (material 8) is sculpted on him and on nobody else,
  // and the shader carries the three cuts of the scar through his left eye
  test("Caesar has the crystal and the scar; the keepers have neither", () => {
    const m = js.indexOf("function hofKernel()"), e = js.indexOf("  /* ---------------- the keepers on screen");
    const K = new Function(js.slice(m, e) + "; return hofKernel();")() as any;
    const gems = (i: number) => (K.build(i, 0.012).mat as Float32Array).filter((v) => v === 8).length;
    expect(gems(10)).toBeGreaterThan(20);
    expect(gems(0)).toBe(0);
    const cuts = K.scarSegments() as number[][];
    expect(cuts.length).toBeGreaterThanOrEqual(12);
    expect(cuts.every(([ax, , bx]) => ax > 0 && bx > 0)).toBe(true);   // all on his left side
    expect(js).toContain("if (uCaesar > 0.5 && vO.y > 0.38");
  });
});
