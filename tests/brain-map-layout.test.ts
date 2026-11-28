// The Brain in Map mode: the map is on the first screen, desktop and phone, with 44px targets and no sideways scroll.
// Skipped without playwright-core or Chromium.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = join(import.meta.dir, "..");
const npx = join(homedir(), ".npm", "_npx");
const lib = [process.env.PLAYWRIGHT_CORE ?? "", join(ROOT, "node_modules", "playwright-core"), "/tmp/csr-qa/node_modules/playwright-core", ...(existsSync(npx) ? readdirSync(npx).map((d) => join(npx, d, "node_modules", "playwright-core")) : [])].map((x) => x && join(x, "index.js")).find((x) => x && existsSync(x)) ?? "";
const chrome = (() => { const d = join(homedir(), ".cache", "ms-playwright"); return existsSync(d) ? readdirSync(d).filter((x) => x.startsWith("chromium-")).sort().reverse().map((x) => join(d, x, "chrome-linux64", "chrome")).find(existsSync) : undefined; })();

describe.skipIf(!lib || !chrome)("Brain map layout in a real browser", () => {
  const PORT = 49400 + Math.floor(Math.random() * 90), BASE = `http://127.0.0.1:${PORT}`;
  let dir = "", core: ReturnType<typeof Bun.spawn> | undefined, browser: any;
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "brainmap-")); mkdirSync(join(dir, "home")); mkdirSync(join(dir, "data"));
    core = Bun.spawn([process.execPath, "core/server.ts"], { cwd: ROOT, stdout: "ignore", stderr: "ignore",
      env: { ...process.env, HOME: join(dir, "home"), CAESAROS_DATA: join(dir, "data"), CAESAROS_PORT: String(PORT), CAESAROS_HOST: "127.0.0.1", CAESAROS_TEST_ENGINE: "1" } });
    let up = false; for (let n = 0; n < 300 && !up; n++) { try { up = (await fetch(`${BASE}/api/health`)).ok; } catch { await Bun.sleep(200); } }
    expect(up).toBe(true);
    const pw = await import(pathToFileURL(lib).href);
    browser = await pw.chromium.launch({ executablePath: chrome, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  }, 300_000);
  afterAll(async () => { await browser?.close(); core?.kill(); if (dir) rmSync(dir, { recursive: true, force: true }); });

  // [width, height, highest allowed canvas top, space the bottom bar takes, smallest useful canvas]
  for (const [width, height, maxTop, foot, minH] of [[1440, 900, 290, 27, 450], [390, 844, 400, 45, 300]]) test(`the map is on the first screen at ${width}x${height}`, async () => {
    const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: width < 500, isMobile: width < 500, serviceWorkers: "block", reducedMotion: "reduce" });
    const p = await ctx.newPage(); p.setDefaultTimeout(120_000);
    await p.goto(BASE); await p.click("[data-boot-lang=en]"); await p.waitForTimeout(1000);
    await p.evaluate(() => localStorage.setItem("caesaros-brain-map-open", "1")); await p.reload(); await p.waitForTimeout(2500);
    await p.evaluate(() => (0, eval)("if(document.querySelector('#boot'))enter(); S.simple=false; open_({k:'app',id:'Memory'}); render()"));
    await p.click("[data-nt=demo]"); await p.waitForSelector(".nt-gc"); await p.waitForTimeout(1500);
    const m = await p.evaluate(() => {
      const c = document.querySelector(".nt-gc")!.getBoundingClientRect(), v = document.querySelector(".nx-view.nt") as HTMLElement;
      const banner = v.querySelector(".nx-scene")?.getBoundingClientRect().height ?? 0;
      const small = [...v.querySelectorAll(".nt-ed button, .nt-ed input")].map((e) => [e.textContent || e.id, e.getBoundingClientRect()] as const).filter(([, r]) => r.width && (r.width < 43.5 || r.height < 43.5)).map(([n]) => n);
      return { top: c.top, bottom: c.bottom, height: c.height, banner, small, side: Math.max(v.scrollWidth - v.clientWidth, document.documentElement.scrollWidth - innerWidth), scrolled: v.scrollTop };
    });
    expect(m.top).toBeLessThan(maxTop);
    expect(m.bottom).toBeLessThanOrEqual(height - foot);
    expect(m.height).toBeGreaterThan(minH);
    expect([m.banner, m.side, m.scrolled, m.small]).toEqual([0, 0, 0, []]);
    // the folded sample note opens in place, and closing the map brings the banner back
    await p.click("[data-nt=sample-info]"); expect(await p.locator(".nt-ed .nt-msg").textContent()).toContain("Sample map, not your notes.");
    await p.click("[data-nt=mapclose]"); await p.waitForTimeout(300);
    expect(await p.evaluate(() => document.querySelector(".nx-view.nt .nx-scene")!.getBoundingClientRect().height)).toBeGreaterThan(0);
    await ctx.close();
  }, 600_000);
});
