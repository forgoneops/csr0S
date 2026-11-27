// @ts-nocheck (page-context globals inside evaluate callbacks)
// Fresh-install audit: empty data dir, own core, headless Chromium. Opens every page of the shell and records page errors,
// console errors, failed requests, and whether it still shows a skeleton or "Loading" after the wait.
// Usage: bun tools/fresh-audit.ts [--all-modules] [--reload] [--wait=12000] [--shots=dir] [--only=Name,Name]
import { spawn } from "bun";
import { existsSync, mkdtempSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = join(import.meta.dir, "..");
const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
const FORCE = process.argv.includes("--force"), ALL = process.argv.includes("--all-modules"), RELOAD = process.argv.includes("--reload");
const WAIT = Number(arg("wait") ?? 12000), SHOTS = arg("shots") ?? "", ONLY = arg("only")?.split(",");
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const PORT = 49000 + Math.floor(Math.random() * 900), BASE = `http://127.0.0.1:${PORT}`;
const data = mkdtempSync(join(tmpdir(), "fresh-audit-"));
const pwDir = [process.env.PLAYWRIGHT_CORE ?? "", join(ROOT, "node_modules", "playwright-core"), "/tmp/csr-qa/node_modules/playwright-core"].find((x) => x && existsSync(join(x, "package.json")));
if (!pwDir) throw new Error("playwright-core not found");
const chrome = (() => { const d = join(homedir(), ".cache", "ms-playwright"); return readdirSync(d).filter((x) => x.startsWith("chromium-")).sort().reverse().map((x) => join(d, x, "chrome-linux64", "chrome")).find(existsSync); })();

const core = spawn(["bun", "core/server.ts"], { cwd: ROOT, stdout: "ignore", stderr: "ignore", env: { ...process.env, CAESAROS_DATA: data, CAESAROS_PORT: String(PORT), CAESAROS_HOST: "127.0.0.1" } });
try {
  for (let i = 0; i < 150; i++) { try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* not up */ } await Bun.sleep(200); }
  const pw = await import(pathToFileURL(join(pwDir, "index.js")).href);
  const browser = await pw.chromium.launch({ executablePath: chrome, args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "en-US", serviceWorkers: "block" });
  const p = await ctx.newPage();
  let cur = "boot"; const log: Record<string, { pe: string[]; ce: string[]; net: string[] }> = {};
  const L = () => (log[cur] ??= { pe: [], ce: [], net: [] });
  p.on("pageerror", (e: Error) => L().pe.push(e.message.slice(0, 160)));
  p.on("console", (m: any) => { if (m.type() === "error") L().ce.push(m.text().slice(0, 160)); });
  p.on("response", (r: any) => { if (r.status() >= 400) L().net.push(`${r.status()} ${new URL(r.url()).pathname}`); });
  p.on("requestfailed", (r: any) => { const f = r.failure()?.errorText ?? ""; if (!/ABORTED/.test(f)) L().net.push(`FAIL ${new URL(r.url()).pathname}`); });
  const boot = async () => {
    await p.goto(BASE);
    try { await p.locator('[data-boot-lang="en"]').click({ timeout: 8000, force: true }); await p.waitForSelector("#boot", { state: "detached", timeout: 15000 }); } catch (e) { console.log("gate:", String(e).slice(0, 100)); }
    await p.waitForTimeout(2500);
    try { await p.locator('[data-su="finish"]').click({ timeout: 1500 }); await p.waitForTimeout(1200); } catch { /* not first run */ }
  };
  await boot();
  if (ALL) {
    const groups: { apps: string[]; defaults: string[] }[] = await p.evaluate(() => (window as any).MODULE_GROUPS);
    const keys = groups.flatMap((g) => g.apps).map((n) => "app-" + n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
    const code = await p.evaluate(async (k: string[]) => (await fetch("/api/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabledModules: k }) })).status, keys);
    console.log("enable all modules ->", code);
    await boot();
  }
  if (RELOAD) await p.reload().then(() => p.waitForTimeout(3500));
  const names: string[] = await p.evaluate(() => [...new Set([...NSIA.flatMap((g: any) => g[2].map((x: any) => x[0])), "Start", "Settings", "Notifications", "Updates", "Search"])] as string[]);
  const rows: string[] = []; let stuck = 0, errs = 0;
  for (const n of (ONLY ?? names)) {
    cur = n; log[n] = { pe: [], ce: [], net: [] };
    const enabled = await p.evaluate(([x, f]: [string, boolean]) => { if (f) OGS.mods.add(x); return ogEnabled(x); }, [n, FORCE] as [string, boolean]);
    if (!enabled && !["Start", "Settings"].includes(n)) { rows.push(`| ${n} | off | not reachable (module off) | | | | |`); continue; }
    await p.evaluate((x: string) => { open_({ k: "app", id: x }); render(); }, n);
    const t0 = Date.now(); let busy = true, empty = "";
    while (Date.now() - t0 < WAIT) {
      await p.waitForTimeout(500);
      busy = await p.evaluate(() => { const v = document.querySelector(".nx-views .nx-view:last-child, .nx-views") as HTMLElement | null; if (!v) return false; const vis = (e: Element) => (e as HTMLElement).offsetParent !== null; return [...v.querySelectorAll('[aria-busy="true"], [class*="skel"]')].some(vis) || /\bLoading\b|Loading…|Loading\.\.\./.test(v.innerText || "") || (v.innerText || "").trim().length < 40; });
      if (!busy) break;
    }
    empty = await p.evaluate(() => { const v = document.querySelector(".nx-views") as HTMLElement | null; const t = (v?.innerText || "").trim(); return t.length < 40 ? "BLANK" : ""; });
    if (SHOTS) await p.screenshot({ path: join(SHOTS, n.replace(/\W+/g, "_") + ".png") });
    const l = log[n], bad = l.pe.length + l.ce.length + l.net.length;
    if (busy) stuck++; if (bad || empty) errs++;
    rows.push(`| ${n} | ${enabled ? "on" : "off"} | ${busy ? "STUCK" : "ok " + ((Date.now() - t0) / 1000).toFixed(1) + "s"} | ${l.pe.length} | ${[...new Set(l.ce)].slice(0, 2).join(" ; ").replace(/\|/g, "/")} | ${[...new Set(l.net)].slice(0, 3).join(", ")} | ${empty} |`);
  }
  console.log(`mode all=${ALL} reload=${RELOAD}\n| page | module | loading | pageerrors | console errors | failed requests | blank |\n|---|---|---|---|---|---|---|\n${rows.join("\n")}\nboot: ${JSON.stringify(log.boot)}\nSTUCK=${stuck} ERRORING=${errs} of ${rows.length}`);
  await browser.close();
} finally { core.kill(); }
