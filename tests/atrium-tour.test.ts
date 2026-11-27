// The first-run tour (web/atrium/tour.js) must point at things that are really on the screen. The pages are
// drawn by many scripts from live data, so the real proof is a real browser: this boots a core on an empty
// data folder and an empty HOME and walks every step in headless Chromium at desktop and phone size, with the
// optional modules off (a fresh install) and on. Without playwright-core or Chromium that part is SKIPPED; only
// the static check then runs, and it cannot see a hidden, covered, wrong-page or never-rendered target.
// TOUR_SHOTS=<dir> saves a screenshot of every step; TOUR_PORT fixes the port; PLAYWRIGHT_CORE points at the library.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = join(import.meta.dir, "..");
const ATRIUM = join(ROOT, "web", "atrium");
const SRC = readFileSync(join(ATRIUM, "tour.js"), "utf8");
const SHOTS = process.env.TOUR_SHOTS || "";

type Step = [at: string, en: string, text: string, pl: string, plText: string, o: { page: string; mod?: string }];
// the step table, read out of the script itself
const STEPS = new Function(`return ${SRC.slice(SRC.indexOf("const STEPS = [") + "const STEPS = ".length, SRC.indexOf("\n  ];", SRC.indexOf("const STEPS = [")) + 4)}`)() as Step[];

describe("tour steps, static", () => {
  const others = readdirSync(ATRIUM).filter((f) => /\.(js|html)$/.test(f) && f !== "tour.js").map((f) => readFileSync(join(ATRIUM, f), "utf8")).join("\n");

  test("the tour covers the pages a new user needs, and every step has a target and both languages", () => {
    const titles = STEPS.map((s) => s[1]).join(" | ");
    for (const t of ["Home", "Six workspaces", "Talk to Caesar", "Choose your tools", "Skills map", "Library", "Brain", "Gateway"]) expect(titles).toContain(t);
    for (const s of STEPS) for (const part of s.slice(0, 5)) expect((part as string).length).toBeGreaterThan(0);
  });

  test("every class, id and data attribute a step names exists in the Atrium's sources", () => {
    const missing: string[] = [];
    for (const s of STEPS) for (const sel of s[0].split(",")) for (const [, name] of sel.matchAll(/(?:[.#]|\[)([a-zA-Z][\w-]*)/g))
      if (!new RegExp(`(?<![\\w-])${name}(?![\\w-])`).test(others)) missing.push(`${s[1]}: ${sel.trim()} (${name})`);
    expect(missing).toEqual([]);
    expect(others).toContain("data-su-module");   // what a switched-off step points at
  });
});

const real = homedir();
const lib = (() => {
  const c = [process.env.PLAYWRIGHT_CORE ?? "", join(ROOT, "node_modules", "playwright-core"), "/tmp/csr-qa/node_modules/playwright-core"];
  const npx = join(real, ".npm", "_npx");
  if (existsSync(npx)) for (const d of readdirSync(npx)) c.push(join(npx, d, "node_modules", "playwright-core"));
  const f = c.find((x) => x && existsSync(join(x, "index.js")));
  return f ? join(f, "index.js") : "";
})();
const chrome = (() => {
  const d = join(real, ".cache", "ms-playwright");
  return existsSync(d) ? readdirSync(d).filter((x) => x.startsWith("chromium-")).sort().reverse().map((x) => join(d, x, "chrome-linux64", "chrome")).find(existsSync) : undefined;
})();
const canRun = !!lib && !!chrome;
if (!canRun) console.warn("atrium-tour: no playwright-core or Chromium here, the real-browser walk is skipped");

describe.skipIf(!canRun || !!process.env.CAESAROS_SKIP_HEAVY)("tour in a real browser, fresh empty profile", () => {
  const PORT = Number(process.env.TOUR_PORT) || 45900 + Math.floor(Math.random() * 90), BASE = `http://127.0.0.1:${PORT}`;
  let dir = "", core: ReturnType<typeof Bun.spawn> | undefined, browser: any;
  const SLOW = 1_500_000;   // software GL on a loaded machine is slow

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "tour-"));
    mkdirSync(join(dir, "home")); mkdirSync(join(dir, "data"));
    if (SHOTS) mkdirSync(SHOTS, { recursive: true });
    core = Bun.spawn([process.execPath, "core/server.ts"], { cwd: ROOT, stdout: "ignore", stderr: "ignore",
      env: { ...process.env, HOME: join(dir, "home"), CAESAROS_DATA: join(dir, "data"), CAESAROS_PORT: String(PORT), CAESAROS_HOST: "127.0.0.1", CAESAROS_TEST_ENGINE: "1" } });
    let up = false;
    for (let n = 0; n < 300 && !up; n++) { try { up = (await fetch(`${BASE}/api/health`)).ok; } catch { await Bun.sleep(200); } }
    expect(up).toBe(true);
    const pw = await import(pathToFileURL(lib).href);
    browser = await pw.chromium.launch({ executablePath: chrome, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  }, SLOW);
  afterAll(async () => { await browser?.close(); core?.kill(); if (dir) rmSync(dir, { recursive: true, force: true }); });

  const open = async (w: number, h: number, query: string, asPerson = false) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: "en-US", serviceWorkers: "block", reducedMotion: "reduce", hasTouch: w < 500, isMobile: w < 500 });
    if (asPerson) await ctx.addInitScript(() => Object.defineProperty(navigator, "webdriver", { get: () => false }));   // the tour never auto-starts under automation
    const p = await ctx.newPage(); p.setDefaultTimeout(120_000);
    const errors: string[] = []; p.on("pageerror", (e: Error) => errors.push(e.message));
    await p.goto(BASE + query);
    await p.waitForFunction("window.xTour && window.WSI && window.SETTINGS", null, { timeout: 400_000 });
    await p.waitForTimeout(2500);   // the first run opens Start by itself after 900 ms
    return { ctx, p, errors };
  };
  const put = async (p: any, body: object) => expect(await p.evaluate(async (b: object) => {
    const r = await fetch("/api/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
    const s = await r.json(); (window as any).applyOptionalModules(s); return r.status;
  }, body)).toBe(200);

  /** What is wrong with the step on screen right now; empty means the card points at a real, uncovered target. */
  const faults = (p: any): Promise<string[]> => p.evaluate(`(() => {
    const out = [], host = document.getElementById('tour'); if (!host) return ['the tour is not open'];
    const step = window.xTour.steps[+host.dataset.tourAt], card = host.querySelector('.tour-card').getBoundingClientRect(), sel = host.dataset.tourHit;
    const tab = S.tabs[S.act], page = host.dataset.tourOn;
    if (page === 'home' ? !(tab.k === 'ws' && S.ws === 0) : tab.id !== page) out.push('wrong page, wanted ' + page);
    if (card.left < 0 || card.top < 0 || card.right > innerWidth + 0.5 || card.bottom > innerHeight + 0.5) out.push('card off screen ' + [card.left, card.top, card.right, card.bottom].map(Math.round));
    for (const [x, y] of [[card.right - 24, card.bottom - 24], [card.left + 24, card.top + 24]]) if (!host.contains(document.elementFromPoint(x, y))) out.push('something sits on top of the card');
    for (const b of host.querySelectorAll('button')) if (b.hidden && b.getBoundingClientRect().width) out.push('hidden button still shows: ' + b.dataset.tour);
    const buttons = [...host.querySelectorAll('button')].filter(b => !b.hidden);
    if (!buttons.some(b => b.dataset.tour === 'skip')) out.push('no skip button');
    for (const b of buttons) { const r = b.getBoundingClientRect();
      for (const dx of [4, r.width / 2, r.width - 4]) if (!b.contains(document.elementFromPoint(r.left + dx, r.top + r.height / 2))) { out.push('button covered ' + b.dataset.tour); break; }
      if (r.width < 43.5 || r.height < 43.5) out.push('small button ' + b.dataset.tour + ' ' + Math.round(r.width) + 'x' + Math.round(r.height)); }
    if (!host.contains(document.activeElement)) out.push('focus left the card');
    if (!sel) return [...out, 'no target for ' + step[0]];
    const el = sel.split(',').flatMap(s => [...document.querySelectorAll(s.trim())]).find(e => { const r = e.getBoundingClientRect(); return r.width > 4 && r.height > 4 && r.right > 0 && r.left < innerWidth; });
    if (!el) return [...out, 'target gone: ' + sel];
    const r = el.getBoundingClientRect(), x = (Math.max(r.left, 0) + Math.min(r.right, innerWidth)) / 2, y = r.top + r.height / 2;
    if (y < 0 || y > innerHeight) out.push('target off screen: ' + sel);
    else { const hit = document.elementFromPoint(x, y); if (!hit || !(el.contains(hit) || hit.contains(el))) out.push('target covered by ' + (hit ? hit.tagName + '.' + hit.className : 'nothing') + ': ' + sel); }
    if (!(card.right <= r.left || card.left >= r.right || card.bottom <= r.top || card.top >= r.bottom)) out.push('card covers target: ' + sel);
    return out;
  })()`);

  async function walk(p: any, tag: string) {
    await p.evaluate("window.xTour.start()");
    const bad: string[] = [];
    for (let n = 0; n < STEPS.length; n++) {
      expect(await p.evaluate("document.getElementById('tour').dataset.tourAt")).toBe(String(n));
      let f: string[] = [];
      for (let t = 0; t < 30; t++) { await p.waitForTimeout(500); f = await faults(p); if (!f.length) break; }   // pages load their data after they open
      if (f.length) bad.push(`${tag} step ${n + 1} ${STEPS[n]![1]}: ${f.join("; ")}`);
      if (SHOTS) await p.screenshot({ path: join(SHOTS, `${tag}-${String(n + 1).padStart(2, "0")}.png`), timeout: 400_000 });
      await p.locator('#tour [data-tour="next"]').click();
    }
    expect(bad).toEqual([]);
    expect(await p.evaluate("!!document.getElementById('tour')")).toBe(false);
  }

  for (const [tag, w, h] of [["desk", 1440, 900], ["phone", 390, 844]] as const) {
    test(`${tag}: every step has its target on screen, modules off and on`, async () => {
      const { ctx, p, errors } = await open(w, h, "/?notour&noboot");
      await put(p, { setupDone: true, motion: "off", enabledModules: [] });
      await p.evaluate("document.documentElement.dataset.motion = 'off'");
      await walk(p, `${tag}-off`);
      await put(p, { enabledModules: ["app-library", "app-skills"] });
      await walk(p, `${tag}-on`);
      expect(errors).toEqual([]);
      await ctx.close();
    }, SLOW);

    test(`${tag}: skip, Esc, Tab, no return after reload, restart from Help`, async () => {
      const first = await open(w, h, "/", true);
      const { ctx, p } = first;
      await put(p, { setupDone: true, motion: "off" });
      const isOpen = () => p.evaluate("!!document.getElementById('tour')");
      const waitOpen = () => p.waitForSelector("#tour", { timeout: 60_000 });
      const reload = async () => { await p.reload(); await p.waitForFunction("window.xTour && window.SETTINGS", null, { timeout: 120_000 }); await p.waitForTimeout(5000); };
      await p.evaluate("localStorage.removeItem('caesaros-tour')");
      await p.reload(); await waitOpen();                                   // a first run starts it by itself
      await p.evaluate("document.documentElement.dataset.motion = 'on'");   // reduced motion asked by the system still wins
      expect(await p.evaluate("getComputedStyle(document.querySelector('#tour .tour-hl')).transitionDuration")).toBe("0s");
      for (let n = 0; n < 6; n++) { await p.keyboard.press(n === 4 ? "Shift+Tab" : "Tab"); expect(await p.evaluate("document.getElementById('tour').contains(document.activeElement)")).toBe(true); }
      await p.locator('#tour [data-tour="skip"]').click();
      expect(await isOpen()).toBe(false);
      await reload(); expect(await isOpen()).toBe(false);
      for (let n = 0; n < STEPS.length; n++) {                              // Esc closes it on every step
        await p.evaluate(`window.xTour.start(${n})`); await p.keyboard.press("Escape"); expect(await isOpen()).toBe(false);
      }
      await p.evaluate("open_({ k: 'app', id: 'Settings' }); render()");
      await p.locator('[data-st="open:help"]').first().click();
      await p.locator('[data-st="tour:go"]').click(); await waitOpen();      // and Help brings it back
      expect(await p.evaluate("document.getElementById('tour').dataset.tourAt")).toBe("0");
      await p.keyboard.press("Escape");
      // the menu step's phone claim and the menu paths the Help guide names
      if (w < 500) { await p.locator('[data-nx="b-apps"]').click(); await p.waitForFunction("document.getElementById('rail').classList.contains('open')"); }
      await p.locator('[data-ns="more"]').click();
      await put(p, { enabledModules: ["app-library", "app-skills"] });
      await p.evaluate("render()");
      for (const [group, app] of [["System", "Gateway"], ["System", "Skills"], ["Knowledge", "Library"]])
        expect(await p.evaluate(`!!document.querySelector('[data-ns="grp:${group}"]').nextElementSibling.querySelector('[data-app="${app}"]')`)).toBe(true);
      expect(first.errors).toEqual([]);
      await put(p, { enabledModules: [] });
      await ctx.close();
    }, SLOW);
  }
});
