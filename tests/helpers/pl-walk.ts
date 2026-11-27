// @ts-nocheck (page-context code inside evaluate callbacks)
// Walks the real Atrium in Polish in headless Chromium and returns every piece of interface text that is still not Polish.
// Used by tests/ui-rendered-pl.test.ts; run it alone to hunt: bun tests/helpers/pl-walk.ts [--raw]
//
// A rendered string passes when it is (1) a value of the shipped catalog, (2) a catalog key that maps to itself (a name kept in
// English on purpose), (3) Polish by its letters with no English function word in it (text a script built in Polish), or
// (4) matched by IGNORE below. Everything else is reported with the surface it was seen on.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { keyOf } from "../../core/i18n";

const ROOT = join(import.meta.dir, "..", "..");
const real = homedir(), npx = join(real, ".npm", "_npx");
export const LIB = [process.env.PLAYWRIGHT_CORE ?? "", join(ROOT, "node_modules", "playwright-core"), ...(existsSync(npx) ? readdirSync(npx).map((d) => join(npx, d, "node_modules", "playwright-core")) : [])].map((x) => x && join(x, "index.js")).find((x) => x && existsSync(x)) ?? "";
export const CHROME = (() => { const d = join(real, ".cache", "ms-playwright"); return existsSync(d) ? readdirSync(d).filter((x) => x.startsWith("chromium-")).sort().reverse().map((x) => join(d, x, "chrome-linux64", "chrome")).find(existsSync) : undefined; })();

/** Rendered text that is rightly not Polish. Each line says why. */
export const IGNORE: [RegExp, string][] = [
  [/^(CAESAR( ?OS)?( [\d.]+)?|CaesarOS|Caesar|Apes together strong\.?|Evolve)$/i, "brand lines (and the version beside the name) stay in English"],
  [/^(💬 )?Echo \(test\)( · Echo)?$/, "the test engine, never in a real install"],
  [/^[a-z][\w.-]*:[\w.-]+( · [\d.]+ [GM]B)?$/, "model ids as Ollama prints them"],
  [/^(#?[0-9a-f]{7,12}|amd|nvidia|intel)$/i, "a build hash or the GPU vendor as the machine reports it"],
  [/^((@)?(Teknium|witcheer|tonysimons|HermesWatcher|BkashJosi|rlaope|tonbistudio|kommechanic|iamlukethedev|BearHuddleston)( on X)?)$/, "X handles of the credited authors (Hall of Fame), names not words"],
  [/^build [0-9a-f]{7,12}$/, "the build hash"],
  [/^[\w ]+, The \w+$/, "a credited author with the epithet on the Hall of Fame legend"],
  [/^(pon|wt|śr|czw|pt|sob|niedz)\.?, \d{1,2} [a-ząćęłńóśźż]+$/i, "the Home date, formatted by the browser in Polish"],
  [/^\/[a-z]+$/, "slash command names are typed as they are"],
  [/^(SSH|CLI|API|URL|CPU|GPU|VPS|MCP|QR|OK)$/, "technical names"],
];

/** Collected in the page: [surface text, where it sits]. Skips what the translator skips for the person's own words. */
function collect() {
  const out: [string, string][] = [];
  const OWN = '#msgs, .nx-bub, .cdk-msgs, [data-nt-note], .nt-name, .nt-note, .nt-md, .nt-node, .lv-set, .lv-row b, .nx-att-c b, .tg-table-wrap tbody th, .tg-hot li, .tg-hot h3, .ph-rt b, .nx-chead > .label, .rt-slot, [data-ses], [data-no-i18n], #tour';
  const where = (e) => { const p = []; for (let x = e; x && x !== document.body && p.length < 3; x = x.parentElement) p.push(x.tagName.toLowerCase() + (x.id ? "#" + x.id : x.classList.length ? "." + x.classList[0] : "")); return p.reverse().join(">"); };
  const seen = (e) => e.checkVisibility ? e.checkVisibility({ visibilityProperty: true }) : true;
  const codeish = (e) => { for (let x = e; x; x = x.parentElement) if (/^(SCRIPT|STYLE|CODE|PRE|NOSCRIPT|KBD|TEXTAREA)$/.test(x.tagName) || x.isContentEditable) return true; return false; };
  const card = (e) => !!e.closest(".hf-card") && !e.closest("h4");
  const mask = (v, own) => (own ? v.replace(new RegExp("(?<![\\p{L}\\p{N}])" + own.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?![\\p{L}\\p{N}])", "gu"), "{s}") : v);
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
  while ((n = w.nextNode())) { const e = n.parentElement; if (!e || !n.nodeValue.trim() || codeish(e) || (e.closest(OWN) && !card(e))) continue; if (e.tagName === "OPTION" ? !seen(e.parentElement) : !seen(e)) continue; out.push([mask(n.nodeValue, e.getAttribute("data-i18n-own")), where(e)]); }
  for (const e of document.body.querySelectorAll("[placeholder],[title],[aria-label],[alt]")) {
    const own = e.getAttribute("data-i18n-own");
    if ((e.closest(OWN) && !card(e)) || own === "" || !seen(e)) continue;
    for (const a of ["placeholder", "title", "aria-label", "alt"]) { const v = e.getAttribute(a); if (v && v.trim()) out.push([mask(v, own), "@" + a + " " + where(e)]); }
  }
  return out;
}

const flat = (k: string) => k.replace(/\{n\d+\}/g, "{n}");
const ENGLISH = /(^|[^\p{L}])(the|and|of|to|your|you|with|is|are|not|this|that|for|from|yet|on|it|be|no|here|will|can)([^\p{L}]|$)/iu;
export function judge(catalog: Record<string, string>) {
  // a value's own {n} holes become digits again before keyOf, which is how the same text looks on screen
  const values = new Set(Object.values(catalog).map((v) => keyOf(v.replace(/\{n\d*\}/g, "0"))).filter(Boolean).map(flat));
  return (raw: string): boolean => {
    const k = keyOf(raw), s = raw.replace(/\s+/g, " ").trim();
    if (!k) return !(s.length > 300 && ENGLISH.test(s));   // too long for the translator, so long English can never be right
    if (values.has(flat(k)) || catalog[k] === k || IGNORE.some(([re]) => re.test(s))) return true;
    return /[ąćęłńóśźż]/i.test(s) && !ENGLISH.test(s);
  };
}

export type Found = Map<string, { at: string; surfaces: Set<string> }>;
export type WalkOpts = { port?: number; log?: (s: string) => void; shots?: string; phone?: boolean; plant?: string; raw?: boolean; only?: string[] };

export async function walkPolish(o: WalkOpts = {}): Promise<{ found: Found; queued: string[]; leaked: string[]; card: boolean; pages: number; strings: number; errors: string[] }> {
  const PORT = o.port ?? (Number(process.env.CAESAROS_PORT) || 4870 + Math.floor(Math.random() * 10)), BASE = `http://127.0.0.1:${PORT}`;
  const dir = mkdtempSync(join(tmpdir(), "plwalk-")); mkdirSync(join(dir, "home")); mkdirSync(join(dir, "data"));
  if (o.shots) mkdirSync(o.shots, { recursive: true });
  // a bare PATH, so no real engine on this machine can be found or asked for a translation
  const core = Bun.spawn([process.execPath, "core/server.ts"], { cwd: ROOT, stdout: "ignore", stderr: "ignore",
    env: { PATH: `${dirname(process.execPath)}:/usr/bin:/bin`, TMPDIR: tmpdir(), HOME: join(dir, "home"), CAESAROS_DATA: join(dir, "data"), CAESAROS_PORT: String(PORT), CAESAROS_HOST: "127.0.0.1", CAESAROS_TEST_ENGINE: "1" } });
  let browser;
  try {
    let up = false; for (let n = 0; n < 300 && !up; n++) { try { up = (await fetch(`${BASE}/api/health`)).ok; } catch { await Bun.sleep(200); } }
    if (!up) throw new Error("the core did not start on " + PORT);
    const pw = await import(pathToFileURL(LIB).href);
    browser = await pw.chromium.launch({ executablePath: CHROME, args: ["--use-gl=angle", "--use-angle=gl-egl", "--ignore-gpu-blocklist", "--enable-gpu-rasterization"] });
    const size = o.phone ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } : { viewport: { width: 1440, height: 900 } };
    const ctx = await browser.newContext({ ...size, locale: "en-US", serviceWorkers: "block", reducedMotion: "reduce" });
    const p = await ctx.newPage(); p.setDefaultTimeout(90_000);
    const errors: string[] = []; p.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
    await ctx.route((u) => u.hostname !== "127.0.0.1", (r) => r.abort());   // nothing leaves this machine
    ctx.on("page", (x) => { if (x !== p) x.close().catch(() => {}); });
    await p.route("**/api/i18n/*/translate*", (r) => r.abort());
    const catalog = JSON.parse(readFileSync(join(ROOT, "web", "atrium", "locales", "pl.json"), "utf8"));
    const ok = judge(catalog), found: Found = new Map(), all = new Set<string>(); let pages = 0, card = false;
    const settle = async (max = 6000) => {
      const t0 = Date.now(); await p.waitForTimeout(350);
      while (Date.now() - t0 < max && await p.evaluate(() => [...document.querySelectorAll('.nx-views [aria-busy="true"], .nx-views [class*="skel"]')].some((e) => e.offsetParent !== null))) await p.waitForTimeout(300);
      await p.waitForTimeout(450);   // the translator waits 120 ms after a change
    };
    const take = async (surface: string, shot = false) => {
      // translate and read in one go: a page that redraws itself shows English for the translator's 120 ms, which is not what is judged here
      const got: [string, string][] = await p.evaluate(`window.I18N.reload().then(${collect.toString()})`);
      for (const [raw, at] of got) { const s = raw.replace(/\s+/g, " ").trim(); all.add(s); if (o.raw ? !keyOf(s) : ok(raw)) continue; const f = found.get(s) ?? { at, surfaces: new Set() }; f.surfaces.add(surface); found.set(s, f); }
      if (shot && o.shots) await p.screenshot({ path: join(o.shots, surface.replace(/[^\p{L}\p{N}]+/gu, "_") + ".png") });
    };
    // every in-page tab, segment and fold of the view on screen, one after another
    const TABS = '.nx-views [role="tab"], .nx-views .og-seg button, .nx-views .st-seg:not(.su-langs) button:not([data-st^="lang:"]), .nx-views .lx-halls button, .nx-views [data-bd="view"], .nx-views summary';
    const subTabs = async (name: string) => {
      const count = Math.min(await p.evaluate((q) => document.querySelectorAll(q).length, TABS), 24);
      for (let i = 0; i < count; i++) {
        const label = await p.evaluate(([q, k]) => { const b = document.querySelectorAll(q)[k]; if (!b || !b.checkVisibility() || /lang|theme|motion|:mo:|:th:|textscale|scale|pal:|voice|speak/i.test(JSON.stringify(b.dataset))) return null; b.click(); return (b.textContent || "").trim().slice(0, 30) || String(k); }, [TABS, i]);
        if (label !== null) { await settle(2500); await take(`${name} / tab ${label}`); }
      }
    };

    // 1. the real language gate
    await p.goto(BASE + "/?notour");
    await p.waitForSelector('[data-boot-lang="pl"]');
    if (o.shots) await p.screenshot({ path: join(o.shots, "language_gate.png") });   // bilingual until a choice is made, so not judged
    await p.click('[data-boot-lang="pl"]', { force: true });
    await p.waitForFunction(() => !document.getElementById("boot") && window.SETTINGS && window.I18N);
    await p.waitForTimeout(3000);
    if (await p.evaluate(() => document.documentElement.lang) !== "pl") throw new Error("the gate did not leave the page Polish");
    if (o.plant) await p.evaluate((t) => { const d = document.createElement("p"); d.textContent = t; d.id = "planted"; d.style.cssText = "position:fixed;left:0;top:0;z-index:9"; document.body.appendChild(d); }, o.plant);
    const go = async (name: string) => { await p.evaluate((x) => { if (x === "Home") { open_({ k: "ws" }); S.ws = 0; } else open_({ k: "app", id: x }); render(); }, name); await settle(); };
    const want = (n: string) => !o.only || o.only.includes(n);

    // 2. first-run Setup (Start), before it is finished
    if (want("Start")) { await go("Start"); await take("Start (first run)", true); await subTabs("Start (first run)"); }
    await p.evaluate(() => fetch("/api/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ setupDone: true }) }));

    // the person's own words, in every store the walk can fill: none may be looked up, reported or translated
    await p.evaluate(async () => { const post = (u, b) => fetch(u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }).catch(() => {});
      const day = new Date().toISOString().slice(0, 10);
      await post("/api/board", { title: "Zzq card" }); await post("/api/calendar", { title: "Zzq event", date: day }); await post("/api/goals", { title: "Zzq goal", horizon: "today" }); await post("/api/ideas", { title: "Zzq idea" }); await post("/api/notes", { title: "Zzq note", path: "Zzq note.md", content: "Zzq body", body: "Zzq body" }); });

    // 3. every page, optional modules off then on
    for (const mode of ["off", "on"]) {
      if (mode === "on") {
        await p.evaluate(async () => { const keys = window.MODULE_GROUPS.flatMap((g) => g.apps).map((n) => "app-" + n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")); const r = await fetch("/api/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabledModules: keys }) }); window.SETTINGS = await r.json(); window.applyOptionalModules(window.SETTINGS); render(); });
      }
      const names: string[] = await p.evaluate(() => [...new Set([...NSIA.flatMap((g) => g[2].map((x) => x[0])), "Start", "Settings", "Notifications", "Updates", "Search", "Get started", "Mobile app", "Studio", "Computer"])].filter((n) => ogEnabled(n) || ["Start", "Settings", "Mobile app", "Get started"].includes(n)));
      for (const n of ["Home", ...names]) {
        if (!want(n) || (mode === "on" && o.phone && n === "Home")) continue;
        await go(n); pages++; await take(`${n} (modules ${mode})`, mode === "on");
        if (mode === "on") await subTabs(n);
      }
      // the menu, fully open
      await p.evaluate(() => { NXMORE.on = true; for (const k in NS.open) NS.open[k] = true; render(); document.getElementById("rail")?.classList.add("open"); });
      await settle(1000); await take(`menu (modules ${mode})`); await p.evaluate(() => closeRail());
    }

    // 4. the six workspaces
    if (want("Home")) {
      await go("Home");
      const ws = await p.evaluate(() => typeof WSI !== "undefined" ? WSI.length : 6);
      for (let i = 0; i < Math.min(ws, 10); i++) { await p.evaluate((k) => { open_({ k: "ws" }); S.ws = k; render(); }, i); await settle(3000); await take(`workspace ${i + 1}`, true); }
      await p.evaluate(() => { S.ws = 0; render(); });
    }

    // 5. every Settings card, Help among them
    if (want("Settings")) {
      await go("Settings");
      const cards: string[] = await p.evaluate(() => [...document.querySelectorAll('[data-st^="open:"]')].map((b) => b.dataset.st));
      for (const c of cards) { await p.evaluate((k) => { const b = document.querySelector(`[data-st="${k}"]`); if (b) b.click(); }, c); await settle(3000); await take(`Settings / ${c.slice(5)}`, true); await p.evaluate(() => document.querySelectorAll(".nx-views details").forEach((d) => { d.open = true; })); await take(`Settings / ${c.slice(5)} open folds`); }
    }

    // 6. chat: a new conversation, one answer from the echo engine, the header, toolbar and message box
    if (want("Chat")) {
      await go("Chat"); await take("Chat page", true);
      await p.evaluate(() => document.querySelector('[data-ns="chat"]')?.click()); await settle(); await take("chat tab", true);
      const made = await p.evaluate(async () => { const t = await (await fetch("/api/chat-targets")).json(); const e = (Array.isArray(t) ? t : []).find((x) => /echo/i.test(x.id || x.engine || "")); const r = await fetch("/api/chat/sessions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ engine: e ? (e.id || e.engine) : "echo", title: "Zzz Qqq" }) }); return r.ok; });
      if (made) { await go("Conversations"); await settle(7000); await take("Conversations with a chat", true); await p.evaluate(() => document.querySelector('[data-cv="open"]')?.click()); await settle(5000); await take("chat with a conversation", true);
        const inp = await p.$("#inp"); if (inp) { await inp.fill("/"); await settle(800); await take("chat slash commands"); await inp.fill("@"); await settle(800); await take("chat mentions"); await inp.fill(""); } }
    }
    // 7. the dock, the command palette, the bell, pop-ups of the top bar, the terminal pane
    await go("Home");
    for (const [name, open, close] of [
      ["chat dock", () => document.querySelector(".cdk-launch")?.click(), () => { const i = document.querySelector(".cdk-inp"); i?.focus(); i?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); }],
      ["command palette", () => pal(true), () => pal(false)],
      ["bell panel", () => document.querySelector('[data-lv="bell"], .lv-bell, [data-nx="b-bell"]')?.click(), () => document.body.click()],
    ]) { await p.evaluate(open); await settle(2500); await take(name, true); await p.evaluate(close); await p.waitForTimeout(300); }
    await p.evaluate(() => { pal(true); const q = document.querySelector("#nxov input"); q.value = "zzqqxx"; q.dispatchEvent(new Event("input", { bubbles: true })); }); await settle(2500); await take("command palette, nothing found"); await p.evaluate(() => pal(false));
    const topButtons: string[] = await p.evaluate(() => [...new Set([...document.querySelectorAll("[data-nx]")].filter((b) => b.checkVisibility() && !b.closest(".nx-views") && !/stop-all|theme|b-home|term-tab|split|host|fly-ses|pal:|motion/.test(b.dataset.nx)).map((b) => b.dataset.nx))].slice(0, 20));
    for (const k of topButtons) { await p.evaluate((x) => document.querySelector(`[data-nx="${x}"]`)?.click(), k); await settle(1200); await take(`button ${k}`); await p.keyboard.press("Escape"); await p.waitForTimeout(200); await go("Home"); }
    await p.evaluate(() => { S.term = true; render(); }); await settle(1500); await take("terminal pane"); await p.evaluate(() => { S.term = false; render(); });

    // an attachment the chat cannot read: the message carries the file's name
    await p.evaluate(() => { const t = THREADS[0]; if (t) { open_({ k: "chat", id: t.id }); render(); } });
    await settle(2000);
    const file = await p.$('input[type="file"]');
    if (file) { await file.setInputFiles({ name: "zzfile.bin", mimeType: "application/octet-stream", buffer: Buffer.from([0, 1, 2]) }); await settle(2000); await take("chat attachment error", true); }
    // the Hall of Fame card, opened from a nameplate once the 3D scene or the plaques have loaded
    if (want("Settings")) {
      await go("Settings");
      const shown = () => p.evaluate(() => !!document.querySelector(".hof-spot")?.checkVisibility());
      if (!(await shown())) { await p.evaluate(() => document.querySelector('[data-st="open:credits"]')?.click()); await p.waitForTimeout(1500); }
      o.log?.(await p.evaluate(() => JSON.stringify([!!document.querySelector(".hof-spot"), document.querySelectorAll('[data-st="open:credits"]').length, S.tabs[S.act].id, !!document.querySelector(".hof")])));
      if (await shown()) {
        await p.locator(".hof").first().scrollIntoViewIfNeeded(); await p.waitForTimeout(o.phone ? 8000 : 30000);
        await p.evaluate(() => document.querySelector(".hof-spot")?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })));
        await p.waitForTimeout(2500); card = await p.evaluate(() => !!document.querySelector(".hf-card")); if (!card) o.log?.(await p.evaluate(() => JSON.stringify([document.querySelector(".hof")?.className, document.querySelectorAll(".hof canvas").length, typeof window.THREE]))); await take("Hall of Fame card", true); await p.keyboard.press("Escape");
      }
    }

    // the tour speaks its own two languages and has its own test; here it is only photographed
    if (o.shots) for (const n of [0, 2, 8, 11]) { await p.evaluate((k) => window.xTour.start(k), n); await p.waitForTimeout(1800); await p.screenshot({ path: join(o.shots, `tour_step_${n + 1}.png`) }); await p.keyboard.press("Escape"); }

    // 8. the core goes away: error and offline states
    if (!o.only) {
      await p.route("**/api/**", (r) => r.request().url().includes("/api/i18n/") ? r.fallback() : r.fulfill({ status: 500, contentType: "application/json", body: "{}" }));
      for (const n of ["Settings", "Conversations", "Memory", "Library", "Gateway", "Models", "Usage", "Health", "Storage", "Devices", "Schedule", "Goals", "Skills", "Media Gallery", "News", "Meetings"]) { await p.evaluate((x) => { S.tabs = [S.tabs[0]]; S.act = 0; open_({ k: "app", id: x }); render(); }, n); await p.waitForTimeout(7000); await take(`core errors: ${n}`); }
      await p.unroute("**/api/**");
    }
    // what the page itself reported as missing is what would be sent to an engine: none of the seeded words may be in it
    const queued: string[] = (() => { try { return JSON.parse(readFileSync(join(dir, "data", "locales", "pl.missing.json"), "utf8")); } catch { return []; } })();
    const leaked = queued.filter((s) => /zz[qz]/i.test(s));
    return { found, queued, leaked, card, pages, strings: all.size, errors };
  } finally { await browser?.close(); core.kill(); await core.exited; rmSync(dir, { recursive: true, force: true }); }
}

if (import.meta.main) {
  const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
  const r = await walkPolish({ log: console.log, raw: process.argv.includes("--raw"), phone: process.argv.includes("--phone"), shots: arg("shots"), only: arg("only")?.split(",") });
  console.log("leaked", JSON.stringify(r.leaked), "hall card opened", r.card);
  for (const [s, f] of r.found) console.log(JSON.stringify([s, f.at, [...f.surfaces].slice(0, 3).join(" | ")]));
  console.log(`pages=${r.pages} strings=${r.strings} not-polish=${r.found.size} pageerrors=${r.errors.length}`);
  for (const e of [...new Set(r.errors)]) console.log("ERR", e);
}
