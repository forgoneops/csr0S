// Opens the app headless under all 10 Neo Roma palettes (?pal=a..j) and the neutral theme, saves one screenshot each,
// and checks the tokens really changed (--p1 per palette) and that no page error fired.
// Reduced motion is on so the WebGL background stops animating and a software GL screenshot can finish.
// Own core on a throwaway data dir and loopback port. Usage: node tools/palette-check.mjs [shot-dir]
// (needs playwright-core: PLAYWRIGHT_CORE may point at its directory)
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS = process.argv[2] || join(tmpdir(), "palette-check");
mkdirSync(SHOTS, { recursive: true });
const PORT = 46000 + Math.floor(Math.random() * 900), BASE = `http://127.0.0.1:${PORT}`;
const data = mkdtempSync(join(tmpdir(), "palette-check-"));

const pwDir = [process.env.PLAYWRIGHT_CORE ?? "", join(ROOT, "node_modules", "playwright-core"), "/tmp/csr-qa/node_modules/playwright-core"]
  .concat(existsSync(join(homedir(), ".npm", "_npx")) ? readdirSync(join(homedir(), ".npm", "_npx")).map((d) => join(homedir(), ".npm", "_npx", d, "node_modules", "playwright-core")) : [])
  .find((x) => x && existsSync(join(x, "package.json")));
if (!pwDir) throw new Error("playwright-core not found");
const cache = join(homedir(), ".cache", "ms-playwright");
const chrome = readdirSync(cache).filter((x) => x.startsWith("chromium-")).sort().reverse().map((x) => join(cache, x, "chrome-linux64", "chrome")).find(existsSync);

const core = spawn("bun", ["core/server.ts"], { cwd: ROOT, stdio: "ignore",
  env: { ...process.env, CAESAROS_DATA: data, CAESAROS_PORT: String(PORT), CAESAROS_HOST: "127.0.0.1", CAESAROS_TEST_ENGINE: "1" } });
let fails = 0;
const ok = (name, cond, extra = "") => { console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? " (" + extra + ")" : ""}`); if (!cond) fails++; };
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* not up */ } await new Promise((r) => setTimeout(r, 200)); }
  const pw = await import(pathToFileURL(join(pwDir, "index.js")).href).then((m) => m.default ?? m);
  const browser = await pw.chromium.launch({ executablePath: chrome, args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const seen = new Map();
  for (const tag of ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "neutral"]) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "en-US", serviceWorkers: "block", reducedMotion: "reduce" });
    await ctx.addInitScript(() => { try { localStorage.setItem("caesaros-motion", "off"); } catch { /* none */ } });   // a still page: a software-GL screenshot of the live background can starve
    if (tag === "neutral") await ctx.addInitScript(() => { try { localStorage.setItem("caesaros-theme", "neutral"); } catch { /* none */ } });
    const p = await ctx.newPage(); const errs = [];
    p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(tag === "neutral" ? `${BASE}/?theme=neutral` : `${BASE}/?pal=${tag}`, { waitUntil: "domcontentloaded", timeout: 120000 });
    try { await p.locator('[data-boot-lang="en"]').click({ timeout: 6000 }); } catch { /* no gate */ }
    await p.waitForTimeout(2500);
    try { await p.locator('[data-su="finish"]').click({ timeout: 2000 }); await p.waitForTimeout(1500); } catch { /* not first run */ }
    const p1 = await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--p1").trim());
    const file = join(SHOTS, `palette-${tag}.png`);
    let shot = true; try { await p.screenshot({ path: file, animations: "disabled", timeout: 120000 }); } catch { shot = false; }
    seen.set(tag, p1);
    ok(`${tag}: page loads with a --p1 token, no page error and a screenshot`, !!p1 && errs.length === 0 && shot, `${p1} ${errs[0] ?? ""} ${file}`);
    await ctx.close();
  }
  ok("the 10 Neo Roma palettes do not all share one --p1", new Set([..."abcdefghij"].map((k) => seen.get(k))).size > 5);
  ok("neutral differs from the default palette", seen.get("neutral") !== seen.get("j"));
  await browser.close();
} finally { core.kill(); }
process.exit(fails ? 1 : 0);
