// Headless check of the split: every way in, every way out (button, Exit split, Esc, reload), the edge drag (mouse, touch, keys) and the saved ratio.
// Own core on a throwaway data dir and loopback port. Usage: bun tools/split-check.ts [outdir for screenshots]
import { spawn } from "bun";
// The page functions below run inside the browser (page.evaluate); they only need names for the type checker.
declare const OGS: any, S: any, render: () => void, open_: (x: unknown) => void;
import { existsSync, mkdtempSync, readdirSync, mkdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const ROOT = join(import.meta.dir, "..");
const OUT = process.argv[2] || mkdtempSync(join(tmpdir(), "split-shots-")), TAG = "split"; mkdirSync(OUT, { recursive: true });
const PORT = 46100 + Math.floor(Math.random() * 400), BASE = `http://127.0.0.1:${PORT}`;
const data = mkdtempSync(join(tmpdir(), "split-check-"));
const c = [process.env.PLAYWRIGHT_CORE ?? "", "/tmp/csr-qa/node_modules/playwright-core", join(ROOT, "node_modules", "playwright-core"), join(homedir(), "apps", "caesaros-proto", "node_modules", "playwright-core")];
const npx = join(homedir(), ".npm", "_npx"); if (existsSync(npx)) for (const d of readdirSync(npx)) c.push(join(npx, d, "node_modules", "playwright-core"));
const pwp = join(c.find((x) => x && existsSync(join(x, "package.json")))!, "index.js");
const cd = join(homedir(), ".cache", "ms-playwright");
const chrome = readdirSync(cd).filter((x) => x.startsWith("chromium-")).sort().reverse().map((x) => join(cd, x, "chrome-linux64", "chrome")).find(existsSync);
const core = spawn(["bun", "core/server.ts"], { cwd: ROOT, stdout: "ignore", stderr: "ignore", env: { ...process.env, CAESAROS_DATA: data, CAESAROS_PORT: String(PORT), CAESAROS_HOST: "127.0.0.1", CAESAROS_TEST_ENGINE: "1" } });
let fails = 0; const ok = (n: string, v: boolean, x = "") => { console.log(`${v ? "PASS" : "FAIL"}  ${TAG} ${n}${x ? " (" + x + ")" : ""}`); if (!v) fails++; };
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch {} await Bun.sleep(200); }
  const pw = await import(pathToFileURL(pwp).href);
  const browser = await pw.chromium.launch({ executablePath: chrome, args: ["--no-sandbox", "--use-gl=angle", "--use-angle=gl-egl", "--ignore-gpu-blocklist"] });
  for (const [vt, w, h] of [["1440", 1440, 900], ["1024", 1024, 700]] as const) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: "en-US", serviceWorkers: "block", hasTouch: false });
    const p = await ctx.newPage(); const errs: string[] = []; p.on("pageerror", (e: Error) => errs.push(e.message));
    await p.goto(BASE);
    try { await p.locator('[data-boot-lang="en"]').click({ timeout: 6000 }); } catch {}
    await p.waitForTimeout(2000);
    try { await p.locator('[data-su="finish"]').click({ timeout: 2000 }); await p.waitForTimeout(1200); } catch {}
    const st = () => p.evaluate(() => ({ sp: OGS.sp.on, s: S.split, wrap: !!document.querySelector('#ogsplit'), simple: !!document.querySelector('.nx-views.split'), ratio: OGS.sp.ratio }));
    const shot = (n: string) => p.screenshot({ path: join(OUT, `${TAG}-${vt}-${n}.png`) });
    const reset = async () => { await p.evaluate(() => { OGS.sp.on = false; S.split = false; render(); }); await p.waitForTimeout(200); };
    // two tabs so the strip with the Split button shows
    await p.evaluate(() => { const w = window as any; w.open_({ k: 'app', id: 'Board' }); w.render(); }); await p.waitForTimeout(400);
    // 1: enter by button, leave by button
    await p.locator('[data-nx="split"]').click(); await p.waitForTimeout(400); await shot("on");
    let s = await st(); ok(`${vt} button enters`, s.sp && s.wrap);
    const btnVisible = await p.locator('[data-nx="split"]').isVisible(); ok(`${vt} split button still visible while on`, btnVisible);
    await p.locator('[data-nx="split"]').click({ timeout: 3000 }).catch(() => {}); await p.waitForTimeout(300);
    s = await st(); ok(`${vt} button again leaves`, !s.sp && !s.s && !s.wrap, JSON.stringify(s));
    // 2: exit control
    await p.locator('[data-nx="split"]').click(); await p.waitForTimeout(300);
    const ex = p.locator('.og-spbar [data-sp="off:1"]'); ok(`${vt} exit control visible`, await ex.isVisible());
    await ex.click(); await p.waitForTimeout(300); s = await st(); ok(`${vt} exit control leaves`, !s.sp && !s.s, JSON.stringify(s));
    // 3: Esc
    await p.locator('[data-nx="split"]').click(); await p.waitForTimeout(300); await p.locator('.og-spbar .label').first().click(); await p.keyboard.press("Escape"); await p.waitForTimeout(300);
    s = await st(); ok(`${vt} Esc leaves`, !s.sp && !s.s, JSON.stringify(s));
    // 4: dock path (S.split = true) and button toggles off
    await p.evaluate(() => { S.split = true; render(); }); await p.waitForTimeout(300); await shot("dock-split"); s = await st();
    await p.locator('[data-nx="split"]').click(); await p.waitForTimeout(300); s = await st(); ok(`${vt} simple split: button leaves`, !s.sp && !s.s && !s.simple, JSON.stringify(s));
    // 5: reload while split on
    await p.evaluate(() => { S.split = true; render(); }); await p.waitForTimeout(300);
    await p.reload(); await p.waitForTimeout(2500); s = await st();
    const stuck = s.sp || s.s || s.simple; if (stuck) { await shot("reload"); const ex2 = p.locator('.og-spbar [data-sp="off:1"]'); ok(`${vt} after reload in split, exit control present`, await ex2.count() > 0, JSON.stringify(s)); await ex2.click({ timeout: 2000 }).catch(() => {}); await p.waitForTimeout(300); s = await st(); ok(`${vt} reload then exit works`, !s.sp && !s.s && !s.simple, JSON.stringify(s)); }
    else ok(`${vt} reload does not restore a trap`, true);
    // 6: gutter drag, real mouse
    await p.evaluate(() => { const w = window as any; w.open_({ k: 'app', id: 'Board' }); w.render(); }); await p.waitForTimeout(300);
    await reset(); await p.locator('[data-nx="split"]').click(); await p.waitForTimeout(400);
    const g = await p.evaluate(() => { const e = document.querySelector('.og-gut') as HTMLElement | null; if (!e) return null; const r = e.getBoundingClientRect(); const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) as HTMLElement; return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, hit: top === e || e.contains(top) }; });
    ok(`${vt} gutter present with >=10px hit area`, !!g && g.w >= 10, JSON.stringify(g));
    ok(`${vt} gutter is the topmost element at its centre`, !!g && g.hit);
    const col0 = await p.evaluate(() => getComputedStyle(document.querySelector('#ogsplit')!).gridTemplateColumns);
    if (g) { await p.mouse.move(g.x, g.y); await p.mouse.down(); await p.mouse.move(g.x - 200, g.y, { steps: 8 }); await shot("dragging"); await p.mouse.up(); await p.waitForTimeout(300); }
    const col1 = await p.evaluate(() => getComputedStyle(document.querySelector('#ogsplit')!).gridTemplateColumns);
    const r1 = (await st()).ratio; ok(`${vt} drag changes the columns and keeps them after release`, col0 !== col1, `${col0} -> ${col1} ratio ${r1}`);
    await shot("after-drag");
    await p.locator('.og-gut').focus(); await p.keyboard.press("ArrowRight"); const rk = (await st()).ratio; const an = await p.getAttribute('.og-gut', 'aria-valuenow'); ok(`${vt} arrow key resizes, aria-valuenow follows`, rk === r1 + 2 && an === String(rk), `${r1}->${rk} aria ${an}`);
    for (let i = 0; i < 40; i++) await p.keyboard.press("ArrowLeft"); ok(`${vt} clamped at 20`, (await st()).ratio === 20);
    await p.keyboard.press("Escape"); await p.waitForTimeout(200); await p.locator('[data-nx="split"]').click(); await p.waitForTimeout(300); ok(`${vt} ratio persisted across leave/enter`, (await st()).ratio === 20);
    await p.reload(); await p.waitForTimeout(2500); await p.evaluate(() => { const w = window as any; w.open_({ k: 'app', id: 'Board' }); w.render(); }); await p.locator('[data-nx="split"]').click(); await p.waitForTimeout(300); ok(`${vt} ratio persisted across reload`, (await st()).ratio === 20);
    const gg = await p.evaluate(() => { const r = document.querySelector('.og-gut')!.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await p.evaluate((g: { x: number; y: number }) => { const e = document.querySelector('.og-gut')!; const mk = (t: string, x: number) => e.dispatchEvent(new PointerEvent(t, { pointerId: 7, pointerType: 'touch', clientX: x, clientY: g.y, bubbles: true, button: 0 })); mk('pointerdown', g.x); mk('pointermove', g.x + 300); mk('pointerup', g.x + 300); }, gg);
    ok(`${vt} touch pointer drag resizes`, (await st()).ratio > 20, String((await st()).ratio));
    await p.evaluate(() => { localStorage.removeItem('caesaros-split-v1'); });
    ok(`${vt} no page errors`, errs.length === 0, errs.join("|"));
    await ctx.close();
  }
  await browser.close();
} finally { core.kill(); }
console.log(fails ? `${fails} FAILED` : "ALL PASS"); process.exit(fails ? 1 : 0);
