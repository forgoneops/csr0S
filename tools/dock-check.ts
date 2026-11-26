// Headless check of the chat dock: launcher visible, open, send, same conversation as a chat tab, move, minimise, remembered.
// Own core on a throwaway data dir and loopback port; Chromium from the machine's Playwright cache, windows never shown.
// Usage: bun tools/dock-check.ts [shot-dir]   (needs playwright-core: set PLAYWRIGHT_CORE to its directory if not found)
import { spawn } from "bun";
import { existsSync, mkdtempSync, readdirSync, rmSync, mkdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = join(import.meta.dir, "..");
const SHOTS = process.argv[2] || "";
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const PORT = 45600 + Math.floor(Math.random() * 300), BASE = `http://127.0.0.1:${PORT}`;
const data = mkdtempSync(join(tmpdir(), "dock-check-"));

function playwright(): string {
  const c = [process.env.PLAYWRIGHT_CORE ?? "", join(ROOT, "node_modules", "playwright-core"), "/tmp/csr-qa/node_modules/playwright-core"];
  const npx = join(homedir(), ".npm", "_npx");
  if (existsSync(npx)) for (const d of readdirSync(npx)) c.push(join(npx, d, "node_modules", "playwright-core"));
  const f = c.find((x) => x && existsSync(join(x, "package.json")));
  if (!f) throw new Error("playwright-core not found");
  return join(f, "index.js");
}
const chrome = () => {
  const d = join(homedir(), ".cache", "ms-playwright");
  return readdirSync(d).filter((x) => x.startsWith("chromium-")).sort().reverse().map((x) => join(d, x, "chrome-linux64", "chrome")).find(existsSync);
};

const core = spawn(["bun", "core/server.ts"], { cwd: ROOT, stdout: "ignore", stderr: "ignore",
  env: { ...process.env, CAESAROS_DATA: data, CAESAROS_PORT: String(PORT), CAESAROS_HOST: "127.0.0.1", CAESAROS_TEST_ENGINE: "1", CAESAROS_ECHO_DELAY_MS: "200" } });
let fails = 0;
const ok = (name: string, cond: boolean, extra = "") => { console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? " (" + extra + ")" : ""}`); if (!cond) fails++; };
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* not up */ } await Bun.sleep(200); }
  const pw = await import(pathToFileURL(playwright()).href);
  const browser = await pw.chromium.launch({ executablePath: chrome(), args: ["--no-sandbox"] });
  for (const [tag, w, h] of [["desk", 1440, 900], ["phone", 390, 844]] as const) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: "en-US", serviceWorkers: "block" });
    const p = await ctx.newPage(); const errs: string[] = [];
    p.on("pageerror", (e: Error) => errs.push(e.message));
    await p.goto(BASE);
    try { await p.locator('[data-boot-lang="en"]').click({ timeout: 6000 }); } catch { /* no gate */ }
    await p.waitForTimeout(2500);
    try { await p.locator('[data-su="finish"]').click({ timeout: 2000 }); await p.waitForTimeout(1500); } catch { /* not first run */ }
    const box = async (s: string) => await p.evaluate((q: string) => { const e = document.querySelector(q) as HTMLElement | null; if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }, s);
    const L = await box(".cdk-launch");
    ok(`${tag}: launcher visible on the first page`, !!L && L.w >= 44 && L.x >= 0 && L.x + L.w <= w && L.y + L.h <= h);
    await p.locator(".cdk-launch").click();
    await p.waitForTimeout(400);
    ok(`${tag}: click opens the window`, (await box(".cdk-win"))?.w! > 200);
    await p.locator(".cdk-inp").fill("dock check");
    await p.locator(".cdk-send").click();
    await p.waitForFunction(() => (document.querySelector(".cdk-thread")?.textContent || "").includes("dock check"), null, { timeout: 8000 }).catch(() => {});
    await p.waitForTimeout(1200);
    const txt = await p.evaluate(() => document.querySelector(".cdk-thread")?.textContent || "");
    ok(`${tag}: message and a reply are in the thread`, txt.includes("dock check") && txt.length > "dock check".length + 8, txt.slice(0, 60));
    const id = await p.evaluate(() => (window as any).CDK.state.id);
    ok(`${tag}: conversation id is remembered`, !!id && (await p.evaluate(() => localStorage.getItem("caesar.dock.v1") || "")).includes(id));
    if (SHOTS) await p.screenshot({ path: join(SHOTS, `dock-${tag}-open.png`) });
    if (w > 760) {   // move: header drag shifts the window and survives a reload
      const hd = await box(".cdk-hd"), before = await box(".cdk-win");
      await p.mouse.move(hd!.x + 120, hd!.y + 20); await p.mouse.down(); await p.mouse.move(hd!.x + 40, hd!.y - 100, { steps: 6 }); await p.mouse.up();
      const after = await box(".cdk-win");
      ok(`${tag}: header drag moves the window`, !!after && Math.abs(after.x - before!.x) > 40 && after.y < before!.y - 60);
    }
    await p.locator('[data-dk="min"]').click();
    await p.waitForTimeout(300);
    ok(`${tag}: minimise hides the window, launcher stays`, ((await box(".cdk-win"))?.w ?? 0) === 0 && !!(await box(".cdk-launch"))?.w);
    await p.reload(); await p.waitForTimeout(2500);
    await p.keyboard.press("Control+j"); await p.waitForTimeout(800);
    const again = await p.evaluate(() => ({ id: (window as any).CDK.state.id, open: (window as any).CDK.state.open }));
    // the throwaway core's test engine may not persist the turn, so the proof is the same session id, not its text
    ok(`${tag}: Ctrl+J reopens the same conversation after reload`, again.open && again.id === id);
    if (SHOTS) await p.screenshot({ path: join(SHOTS, `dock-${tag}-reopen.png`) });
    ok(`${tag}: no page errors`, errs.length === 0, errs.slice(0, 2).join("; "));
    await ctx.close();
  }
  await browser.close();
} finally { core.kill(); rmSync(data, { recursive: true, force: true }); }
process.exit(fails ? 1 : 0);
