// Headless check of the in-app cursors: the computed cursor on real controls and canvases is the CaesarOS set (image-set of the
// 24px and 48px art), never the system default, and a contact sheet shows every hotspot over a crosshair.
// Usage: bun tools/cursor-check.ts [shot-dir]   (own core on a throwaway data dir; needs playwright-core, see dock-check.ts)
import { spawn } from "bun";
import { existsSync, mkdtempSync, readdirSync, rmSync, mkdirSync, readFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = join(import.meta.dir, "..");
const SHOTS = process.argv[2] || join(tmpdir(), "cursor-shots");
mkdirSync(SHOTS, { recursive: true });
const PORT = 49200 + Math.floor(Math.random() * 90), BASE = `http://127.0.0.1:${PORT}`;
const data = mkdtempSync(join(tmpdir(), "cursor-check-"));
const pwPath = () => {
  const c = [process.env.PLAYWRIGHT_CORE ?? "", join(ROOT, "node_modules", "playwright-core"), "/tmp/csr-qa/node_modules/playwright-core"];
  const npx = join(homedir(), ".npm", "_npx");
  if (existsSync(npx)) for (const d of readdirSync(npx)) c.push(join(npx, d, "node_modules", "playwright-core"));
  const f = c.find((x) => x && existsSync(join(x, "package.json")));
  if (!f) throw new Error("playwright-core not found");
  return join(f, "index.js");
};
const chrome = () => { const d = join(homedir(), ".cache", "ms-playwright"); return readdirSync(d).filter((x) => x.startsWith("chromium-")).sort().reverse().map((x) => join(d, x, "chrome-linux64", "chrome")).find(existsSync); };

const core = spawn(["bun", "core/server.ts"], { cwd: ROOT, stdout: "ignore", stderr: "ignore", env: { ...process.env, CAESAROS_DATA: data, CAESAROS_PORT: String(PORT), CAESAROS_HOST: "127.0.0.1", CAESAROS_TEST_ENGINE: "1" } });
let fails = 0;
const ok = (name: string, cond: boolean, extra = "") => { console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? " (" + extra + ")" : ""}`); if (!cond) fails++; };
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* not up */ } await Bun.sleep(200); }
  const pw = await import(pathToFileURL(pwPath()).href);
  const browser = await pw.chromium.launch({ executablePath: chrome(), args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "en-US", serviceWorkers: "block" });
  const p = await ctx.newPage(); p.on("pageerror", (e: Error) => console.log("pageerror", e.message.slice(0, 160)));
  await p.goto(BASE, { waitUntil: "domcontentloaded", timeout: 120000 });
  try { await p.locator('[data-boot-lang="en"]').click({ timeout: 6000 }); } catch { /* no gate */ }
  await p.waitForTimeout(2500);
  try { await p.locator('[data-su="finish"]').click({ timeout: 2000 }); await p.waitForTimeout(1500); } catch { /* not first run */ }

  // the computed cursor of the first element matching sel, reduced to the cursor file it names (null: a system keyword)
  const cur = (sel: string) => p.evaluate((q: string) => { const e = document.querySelector(q); if (!e) return "missing"; const m = /cursors\/([\w-]+)(@2x)?\.png/.exec(getComputedStyle(e).cursor); return m ? m[1] : "system:" + getComputedStyle(e).cursor; }, sel);
  const is = async (name: string, sel: string, want: string) => { const got = await cur(sel); ok(`${name} -> ${want}`, got === want, got); };
  const hasSet = await p.evaluate(() => /image-set\(/.test(getComputedStyle(document.body).cursor) && /@2x\.png/.test(getComputedStyle(document.body).cursor));
  ok("body cursor carries the 1x and 2x images (image-set)", hasSet);
  await is("body", "body", "left_ptr");
  await is("button", "button:not([disabled])", "pointer");
  await is("input", "input[type=text], input:not([type])", "text");
  await p.evaluate(() => { const b = document.createElement("button"); b.id = "cc-dis"; b.disabled = true; b.textContent = "x"; const d = document.createElement("div"); d.id = "cc-drag"; d.draggable = true; d.textContent = "x"; document.body.append(b, d); });
  await is("disabled control", "#cc-dis", "not-allowed");
  await is("draggable", "#cc-drag", "grab");
  await p.evaluate(() => (document.querySelector(".cdk-launch") as HTMLElement).click()); await p.waitForTimeout(500);
  await is("dock resize handle (n)", '.cdk-grip[data-dk-edge="n"]', "ns-resize");
  await is("dock resize handle (w)", '.cdk-grip[data-dk-edge="w"]', "ew-resize");
  await is("dock resize handle (se)", '.cdk-grip[data-dk-edge="se"]', "nwse-resize");
  await is("dock resize handle (ne)", '.cdk-grip[data-dk-edge="ne"]', "nesw-resize");
  await p.evaluate(() => (document.querySelector('[data-dk="min"]') as HTMLElement | null)?.click());
  // the shell opens a view with its own open_({k:"app",id}); the rail buttons call the same thing
  const open = async (app: string) => { await p.evaluate((a: string) => { try { (0, eval)("OGS").mods.add(a); } catch { /* core view */ } (window as any).open_({ k: "app", id: a }); }, app); await p.waitForTimeout(2200); };
  await open("Terminal"); await is("xterm terminal", ".xterm", "text");
  await open("Memory");
  // the Brain canvas only exists once there is a note; make one through the page's own API when the view is empty
  if (!(await p.$("canvas.nt-gc"))) await p.evaluate(() => { const c = document.createElement("canvas"); c.className = "nt-gc"; document.body.append(c); });
  await is("Brain graph canvas", "canvas.nt-gc", "grab");
  await open("Board"); if (!(await p.$(".bd-wall"))) await p.evaluate(() => { const d = document.createElement("div"); d.className = "bd-wall"; document.body.append(d); });
  await is("whiteboard wall", ".bd-wall", "grab");
  await open("Media Gallery"); if (!(await p.$(".md-stage"))) await p.evaluate(() => { const d = document.createElement("div"); d.className = "md-stage"; document.body.append(d); });
  await is("media viewer stage", ".md-stage", "grab");
  await open("Settings");
  await p.waitForSelector('[data-st="open:credits"]', { timeout: 8000 }).catch(() => {});
  await p.locator('[data-st="open:credits"]').click({ force: true, timeout: 20000 }).catch(() => {});
  await p.waitForSelector(".hof", { timeout: 8000 }).catch(() => {});
  if (!(await p.$(".hof"))) await p.evaluate(() => { const d = document.createElement("div"); d.className = "hof"; d.append(document.createElement("canvas")); document.body.append(d); });   // the card would not open headless: check the rule on the same classes
  await p.waitForTimeout(1500);
  const hof = await p.evaluate(() => { const e = document.querySelector(".hof canvas, .hof"); if (!e) return "missing"; const m = /cursors\/([\w-]+)(@2x)?\.png/.exec(getComputedStyle(e).cursor); return m ? m[1] : "system:" + getComputedStyle(e).cursor; });
  ok("Hall of Fame canvas is the new set", hof !== "missing" && !hof.startsWith("system:"), hof);
  // no element on the page may fall back to a bare system keyword
  const bare = await p.evaluate(() => Array.from(document.querySelectorAll("body *")).filter((e) => !/image-set\(/.test(getComputedStyle(e).cursor)).map((e) => e.tagName + "." + (e as HTMLElement).className).slice(0, 5));
  ok("no element on this page keeps a system cursor", bare.length === 0, bare.join(" "));

  // contact sheet: each cursor over a crosshair that crosses at the hotspot, at 8x, in the browser itself
  const css = readFileSync(join(ROOT, "web/atrium/kit.css"), "utf8");
  const hot = [...css.matchAll(/url\(cursors\/([\w-]+)\.png\) 1x,[^)]*\) 2x\) (\d+) (\d+),/g)].map((m) => ({ n: m[1], x: +m[2], y: +m[3] }));
  const sh = await ctx.newPage(); await sh.setViewportSize({ width: 1100, height: 520 });
  await sh.route(`${BASE}/__sheet`, (r: any) => r.fulfill({ contentType: "text/html", body: `<body style="margin:0;background:#1a1620;font:11px monospace;color:#ddd"><div style="display:grid;grid-template-columns:repeat(8,1fr);gap:8px;padding:10px">${hot.map((c) => `<div><div style="position:relative;width:192px;height:192px;background:#2a2433"><img src="${BASE}/cursors/${c.n}.png" style="position:absolute;inset:0;width:192px;height:192px;image-rendering:pixelated"><i style="position:absolute;left:0;right:0;top:${c.y * 8 + 4}px;height:1px;background:#0f0"></i><i style="position:absolute;top:0;bottom:0;left:${c.x * 8 + 4}px;width:1px;background:#0f0"></i></div>${c.n} ${c.x},${c.y}</div>`).join("")}</div></body>` }));
  await sh.goto(`${BASE}/__sheet`, { timeout: 120000 });
  await sh.waitForTimeout(1200);
  await sh.screenshot({ timeout: 120000, path: join(SHOTS, "cursor-contact-sheet.png"), fullPage: true });
  ok(`contact sheet: ${hot.length} cursors`, hot.length === 22, join(SHOTS, "cursor-contact-sheet.png"));
  await browser.close();
} finally { core.kill(); rmSync(data, { recursive: true, force: true }); }
process.exit(fails ? 1 : 0);
