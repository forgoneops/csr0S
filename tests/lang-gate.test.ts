// First-run language gate: picking Polski must stay Polish. A settings response that was already in flight (it still says
// "en") used to land after the click and flip <html lang> back. This holds that GET until after the click to widen the race,
// then checks the page, a reload, the switch back and forth, Settings and localStorage. Skipped without playwright-core or Chromium.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = join(import.meta.dir, "..");
const real = homedir();
const npx = join(real, ".npm", "_npx");
const lib = [process.env.PLAYWRIGHT_CORE ?? "", join(ROOT, "node_modules", "playwright-core"), "/tmp/csr-qa/node_modules/playwright-core", ...(existsSync(npx) ? readdirSync(npx).map((d) => join(npx, d, "node_modules", "playwright-core")) : [])].map((x) => x && join(x, "index.js")).find((x) => x && existsSync(x)) ?? "";
const chrome = (() => { const d = join(real, ".cache", "ms-playwright"); return existsSync(d) ? readdirSync(d).filter((x) => x.startsWith("chromium-")).sort().reverse().map((x) => join(d, x, "chrome-linux64", "chrome")).find(existsSync) : undefined; })();
const canRun = !!lib && !!chrome;

describe.skipIf(!canRun)("language gate in a real browser", () => {
  const PORT = Number(process.env.LANG_PORT) || 49300 + Math.floor(Math.random() * 90), BASE = `http://127.0.0.1:${PORT}`;
  let dir = "", core: ReturnType<typeof Bun.spawn> | undefined, browser: any;
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "lang-")); mkdirSync(join(dir, "home")); mkdirSync(join(dir, "data"));
    core = Bun.spawn([process.execPath, "core/server.ts"], { cwd: ROOT, stdout: "ignore", stderr: "ignore",
      env: { ...process.env, HOME: join(dir, "home"), CAESAROS_DATA: join(dir, "data"), CAESAROS_PORT: String(PORT), CAESAROS_HOST: "127.0.0.1", CAESAROS_TEST_ENGINE: "1" } });
    let up = false; for (let n = 0; n < 300 && !up; n++) { try { up = (await fetch(`${BASE}/api/health`)).ok; } catch { await Bun.sleep(200); } }
    expect(up).toBe(true);
    const pw = await import(pathToFileURL(lib).href);
    browser = await pw.chromium.launch({ executablePath: chrome, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  }, 300_000);
  afterAll(async () => { await browser?.close(); core?.kill(); if (dir) rmSync(dir, { recursive: true, force: true }); });

  test("Polski sticks through a late settings response, reload and switching", async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "en-US", serviceWorkers: "block", reducedMotion: "reduce" });
    const p = await ctx.newPage(); p.setDefaultTimeout(120_000);
    let release!: () => void, read!: () => void;
    const gate = new Promise<void>((r) => (release = r)), responseRead = new Promise<void>((r) => (read = r));
    await p.route("**/api/settings", async (route: any) => { if (route.request().method() !== "GET") return route.continue(); const early = await route.fetch(); read(); await gate; await route.fulfill({ response: early }); });
    await p.goto(BASE);
    await p.waitForSelector("[data-boot-lang=pl]");
    await responseRead;   // prove the stale response was fetched before the person chooses a language
    await p.click("[data-boot-lang=pl]");
    expect(await p.locator("[data-boot-lang=pl]").getAttribute("aria-pressed")).toBe("true");
    expect(await p.locator("[data-boot-lang=en]").getAttribute("aria-pressed")).toBe("false");
    release(); await p.waitForTimeout(4000);
    const state = () => p.evaluate(() => ({ lang: document.documentElement.lang, ls: localStorage.getItem("caesaros-language-choice") }));
    expect(await state()).toEqual({ lang: "pl", ls: "pl" });
    await p.unroute("**/api/settings");
    await p.reload(); await p.waitForTimeout(5000);
    expect(await state()).toEqual({ lang: "pl", ls: "pl" });
    expect(await p.evaluate(async () => (await (await fetch("/api/settings")).json()).language)).toBe("pl");
    const sw = async (v: string) => { await p.evaluate(async (l: string) => { await fetch("/api/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ language: l }) }); await (window as Window & { I18N?: { setLanguage(language: string): Promise<void> } }).I18N?.setLanguage(l); localStorage.setItem("caesaros-language-choice", l); }, v); };
    await sw("en"); await p.waitForTimeout(500); expect((await state()).lang).toBe("en");
    await sw("pl"); await p.waitForTimeout(2500); expect(await state()).toEqual({ lang: "pl", ls: "pl" });
    await ctx.close();
  }, 600_000);
});
