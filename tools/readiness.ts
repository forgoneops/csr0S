// Readiness pass for the Atrium (docs/plan/ATRIUM-PORT-PLAN-2026-11-22.md, READY FOR DAILY USE).
// Starts a throwaway core (own data dir, port 4492), drives it with Playwright at 1440x900 and 390x844,
// and scores every check that can run on a fresh instance. Checks that need the owner's data or another
// machine are SKIPPED with the reason, never faked. Usage: bun tools/readiness.ts
import { spawn, type Subprocess } from "bun";
import { existsSync, mkdtempSync, readdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

declare const S: any; declare const THREADS: any;                   // the Atrium keeps its state in a top-level const: reachable by name inside page.evaluate, not through window
const ROOT = join(import.meta.dir, "..");
const PORT = 4492;                       // never 4400, 4410 or 4479: those belong to the owner's real instance
const BASE = `http://127.0.0.1:${PORT}`;
type Check = { name: string; state: "pass" | "fail" | "skip"; detail: string };

const checks: Check[] = [];
const pass = (name: string, detail = "") => checks.push({ name, state: "pass", detail });
const fail = (name: string, detail: string) => checks.push({ name, state: "fail", detail });
const skip = (name: string, detail: string) => checks.push({ name, state: "skip", detail });
const record = async (name: string, run: () => Promise<string | void>) => {
  const t0 = Date.now();
  try { const d = await run(); pass(name, typeof d === "string" ? d : ""); console.log(`PASS  ${name} (${Date.now() - t0} ms)`); }
  catch (e) { fail(name, (e as Error).message); console.log(`FAIL  ${name}: ${(e as Error).message.slice(0, 300)}`); }
};

// Playwright is not a dependency of this repo: use the copy the machine already has (npx cache) and its Chromium.
function resolvePlaywright(): string {
  const candidates = [process.env.PLAYWRIGHT_CORE ?? ""];
  candidates.push(join(ROOT, "node_modules", "playwright-core"));
  const npx = join(homedir(), ".npm", "_npx");
  if (existsSync(npx)) for (const d of readdirSync(npx)) candidates.push(join(npx, d, "node_modules", "playwright-core"));
  const miseRoot = join(homedir(), ".local", "share", "mise", "installs", "playwright");
  if (existsSync(miseRoot)) for (const v of readdirSync(miseRoot)) {
    const box = join(miseRoot, v, "node_modules", ".mise");
    if (existsSync(box)) for (const d of readdirSync(box)) {
      if (d.startsWith("playwright-core@")) candidates.push(join(box, d, "node_modules", "playwright-core"));
    }
  }
  const found = candidates.find((c) => c && existsSync(join(c, "package.json")));
  if (!found) throw new Error("playwright-core not found (set PLAYWRIGHT_CORE to its directory)");
  return join(found, "index.js");
}
function resolveChromium(): string | undefined {
  const dir = join(homedir(), ".cache", "ms-playwright");
  if (!existsSync(dir)) return undefined;
  const builds = readdirSync(dir).filter((d) => d.startsWith("chromium-")).sort();
  const chrome = builds.reverse().map((d) => join(dir, d, "chrome-linux64", "chrome")).find(existsSync);
  if (chrome) return chrome;
  const shell = readdirSync(dir).filter((d) => d.startsWith("chromium_headless_shell-")).sort().reverse()
    .map((d) => join(dir, d, "chrome-headless-shell-linux64", "chrome-headless-shell")).find(existsSync);
  return shell; // a shell build is enough for checks that never screenshot; tests do not need one
}

async function waitForHealth(ms: number) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try { const r = await fetch(`${BASE}/api/health`); if (r.ok) return; } catch { /* not up yet */ }
    await Bun.sleep(200);
  }
  throw new Error(`core did not answer on ${BASE} within ${ms / 1000}s`);
}

// Browser-side helper: one page, its errors, and the app router (open_/render are the Atrium's own globals).
type PageLike = {
  goto(u: string): Promise<unknown>; waitForTimeout(ms: number): Promise<void>;
  evaluate<T>(fn: string | ((a?: unknown) => T), arg?: unknown): Promise<T>;
  locator(s: string): any; reload(): Promise<unknown>; close(): Promise<void>;
  on(ev: string, fn: (a: any) => void): void; keyboard: any;
};
const errorsOf = (page: PageLike, sink: string[]) => {
  page.on("pageerror", (e) => sink.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const at = m.location?.().url ?? "";
    if (at.endsWith("/favicon.ico")) return;   // a browser-default request the app never declares; not an app error
    sink.push(`console: ${m.text()}${at ? ` (${at})` : ""}`);
  });
  page.on("response", (r) => { if (r.status() >= 400 && !r.url().includes("favicon")) sink.push(`http ${r.status()}: ${r.url()}`); });
};
const openApp = async (page: PageLike, id: string) => {
  await page.evaluate((name) => { (window as any).open_({ k: "app", id: name }); (window as any).render(); }, id);
  await page.waitForTimeout(350);
};
const until = async (pg: PageLike, ok: () => Promise<boolean>, what: string, ms = 20_000) => {
  const end = Date.now() + ms; while (Date.now() < end) { if (await ok()) return; await pg.waitForTimeout(250); } throw new Error(`timed out waiting for ${what}`);
};

async function main() {
  const dataDir = mkdtempSync(join(tmpdir(), "caesaros-readiness-"));
  const logs: string[] = [];
  let core: Subprocess | undefined, browser: any;
  const cleanup = async () => {
    try { await Promise.race([browser?.close() ?? Promise.resolve(), new Promise((r) => setTimeout(r, 3000))]); } catch { /* already gone */ }
    try {
      if (core && core.exitCode === null) {
        core.kill("SIGKILL");
        await Promise.race([core.exited, new Promise((r) => setTimeout(r, 2000))]);
      }
    } catch { /* already gone */ }
  };

  try {
    const alreadyUp = await (async () => { try { return (await fetch(`${BASE}/api/health`)).ok; } catch { return false; } })();
    if (alreadyUp) throw new Error(`port ${PORT} already answers; a previous readiness core is still running`);

    core = spawn(["bun", "core/server.ts"], {
      cwd: ROOT, stdout: "pipe", stderr: "pipe",
      env: { ...process.env, CAESAROS_DATA: dataDir, CAESAROS_PORT: String(PORT), CAESAROS_HOST: "127.0.0.1", CAESAROS_TEST_ENGINE: "1", CAESAROS_ECHO_DELAY_MS: "350" },
    });
    const reader = async (s: ReadableStream<Uint8Array>) => { for await (const chunk of s) logs.push(new TextDecoder().decode(chunk)); };
    void reader(core.stdout as ReadableStream<Uint8Array>); void reader(core.stderr as ReadableStream<Uint8Array>);

    await record("core starts on a throwaway data dir (port 4492)", async () => { await waitForHealth(20_000); });

    const pw = await import(pathToFileURL(resolvePlaywright()).href);
    browser = await pw.chromium.launch({ executablePath: resolveChromium(), args: ["--no-sandbox"] });

    const page = async (width: number, height: number) => {
      const ctx = await browser.newContext({ viewport: { width, height } });
      const p = await ctx.newPage() as PageLike;
      return { ctx, p };
    };

    // --- fresh instance: first run opens the setup page and its Finish lands on the Atrium ---
    const { p: desk } = await page(1440, 900);
    const deskErrors: string[] = []; errorsOf(desk, deskErrors);
    const bootErrors = deskErrors.splice(0);
    await record("fresh instance boots: first run renders", async () => {
      await desk.goto(`${BASE}/?noboot`);
      try { await desk.locator('[data-su="finish"]').waitFor({ state: "visible", timeout: 15_000 }); }
      catch { throw new Error("setup page did not render"); }
      await desk.locator('[data-su="finish"]').click();
      await desk.waitForTimeout(1200);
      const ok = await desk.evaluate(() => !!document.querySelector(".atrium-top") || !!document.querySelector("#shell .nx-body"));
      if (!ok) throw new Error("Finish did not open the Atrium");
      const early = bootErrors.concat(deskErrors.splice(0));
      if (early.length) throw new Error(early.join("; "));
    });

    await record("Atrium loads without page errors at 1440x900", async () => {
      await desk.goto(`${BASE}/?noboot`);
      await desk.waitForTimeout(1200);
      const shell = await desk.evaluate(() => !!document.querySelector(".nx-body"));
      if (!shell) throw new Error("Atrium shell missing");
      const seen = deskErrors.splice(0);
      if (seen.length) throw new Error(seen.join("; "));
      return "shell rendered, no console or network errors";
    });

    // --- every app opens without errors at both sizes ---
    const appNames: string[] = await desk.evaluate(() => {
      // the rail, the dock and the ns sidebar all carry data-app; that set is what the Atrium offers today
      return [...new Set([...document.querySelectorAll<HTMLElement>("[data-app]")].map((el) => el.dataset.app as string))];
    });
    const openAll = async (p: PageLike, errs: string[]) => {
      await p.goto(`${BASE}/?noboot`);
      await p.waitForTimeout(900);
      errs.splice(0);
      const bad: string[] = [];
      for (const name of appNames) {
        errs.splice(0);
        await openApp(p, name);
        const view = await p.evaluate(() => {
          const v = document.querySelector(".nx-view");
          return v ? (v as HTMLElement).innerText.trim().slice(0, 40) : "";
        });
        if (!view) bad.push(`${name}: no view`);
        if (errs.length) bad.push(`${name}: ${errs.join(", ")}`);
      }
      if (bad.length) throw new Error(`${bad.length}/${appNames.length} apps: ${bad.join(" | ")}`);
      return `${appNames.length} apps opened clean`;
    };
    await record(`all ${appNames.length} apps open without errors at 1440x900`, () => openAll(desk, deskErrors));

    const { ctx: phoneCtx, p: phone } = await page(390, 844);
    const phoneErrors: string[] = []; errorsOf(phone, phoneErrors);
    await record("Atrium loads without page errors at 390x844", async () => {
      await phone.goto(`${BASE}/?noboot`);
      await phone.waitForTimeout(1200);
      const shell = await phone.evaluate(() => !!document.querySelector(".nx-body"));
      if (!shell) throw new Error("Atrium shell missing on phone");
      const seen = phoneErrors.splice(0);
      if (seen.length) throw new Error(seen.join("; "));
    });
    await record(`all ${appNames.length} apps open without errors at 390x844`, () => openAll(phone, phoneErrors));

    // --- Brain: create, edit, conflict safety, search (through the Atrium, same context as the operator) ---
    const token = `readiness-${Date.now().toString(36)}`;
    const noteText = `Readiness check ${token}\n#readiness`;
    await record("a note can be created and saved", async () => {
      await desk.goto(`${BASE}/?noboot`); await desk.waitForTimeout(900);
      await openApp(desk, "Memory");
      await desk.locator('[data-nt="new"]').first().click();
      await desk.waitForTimeout(800);
      await desk.locator("#nt-editor").fill(noteText);
      await desk.locator('[data-nt="save"]').click();
      await desk.waitForTimeout(900);
      const state = await desk.locator("#nt-state").innerText();
      if (!/saved/i.test(state)) throw new Error(`note not saved (state: ${state})`);
      return token;
    });
    await record("a note can be found by search", async () => {
      await openApp(desk, "Memory");
      await desk.locator("#nt-q").fill(token);
      await desk.waitForTimeout(900);
      const hits = await desk.locator("[data-nt-note]").count();
      if (!hits) throw new Error(`no note matched "${token}"`);
      const snippets = await desk.locator("[data-nt-note] small").allInnerTexts();
      if (!snippets.some((s: string) => s.includes(token))) throw new Error(`search listed ${hits} note(s) but none carries "${token}"`);
      await desk.locator("[data-nt-note]").first().click();
      await desk.waitForTimeout(800);
      const body = await desk.locator("#nt-editor").inputValue();
      if (!body.includes(token)) throw new Error("the search hit opened a note without the text");
      return `${hits} hit(s)`;
    });
    await record("a note can be edited and saved", async () => {
      await desk.locator("#nt-editor").fill(`${noteText}\nedited once`);
      await desk.locator('[data-nt="save"]').click();
      await desk.waitForTimeout(900);
      if (!/saved/i.test(await desk.locator("#nt-state").innerText())) throw new Error("edit did not save");
      await desk.reload(); await desk.waitForTimeout(1000);
      await openApp(desk, "Memory");
      await desk.locator("#nt-q").fill(token); await desk.waitForTimeout(900);
      await desk.locator("[data-nt-note]").first().click(); await desk.waitForTimeout(700);
      const body = await desk.locator("#nt-editor").inputValue();
      if (!body.includes("edited once")) throw new Error("edit did not survive a reload");
    });
    await record("editing with a stale revision keeps the typed text (conflict safety)", async () => {
      const other = await phoneCtx.newPage() as PageLike;
      await other.goto(`${BASE}/?noboot`); await other.waitForTimeout(900);
      await openApp(other, "Memory");
      await other.locator("#nt-q").fill(token); await other.waitForTimeout(900);
      await other.locator("[data-nt-note]").first().click(); await other.waitForTimeout(700);
      await other.locator("#nt-editor").fill(`${noteText}\nedited elsewhere`);
      await other.locator('[data-nt="save"]').click(); await other.waitForTimeout(900);
      await other.close();
      await desk.locator("#nt-editor").fill(`${noteText}\nmine, typed after the other tab`);
      await desk.locator('[data-nt="save"]').click(); await desk.waitForTimeout(900);
      const shown = await desk.evaluate(() => {
        const conf = document.querySelector(".nt-conf") as HTMLElement | null;
        const ed = document.querySelector("#nt-editor") as HTMLTextAreaElement | null;
        return { conflict: !!conf, text: ed?.value ?? "" };
      });
      if (!shown.conflict) throw new Error("no conflict banner on a stale save");
      if (!shown.text.includes("typed after the other tab")) throw new Error("typed text was lost on conflict");
      return "conflict banner shown, typed text kept";
    });

    // --- Settings: text size slider, save and survive a reload, motion switch ---
    const openLook = async () => {
      await openApp(desk, "Settings");
      await desk.locator('[data-st="open:look"]').waitFor({ state: "visible", timeout: 15_000 });
      await desk.locator('[data-st="open:look"]').click();
      await desk.locator("[data-st-range]").waitFor({ state: "visible", timeout: 10_000 });
    };
    await record("text size slider changes the root font size", async () => {
      await openLook();
      const before = await desk.evaluate(() => getComputedStyle(document.documentElement).fontSize);
      await desk.evaluate(() => {
        const r = document.querySelector("[data-st-range]") as HTMLInputElement;
        r.value = "120";
        r.dispatchEvent(new Event("input", { bubbles: true }));
        r.dispatchEvent(new Event("change", { bubbles: true }));   // the app saves on change, paints on input
      });
      await desk.waitForTimeout(200);
      const after = await desk.evaluate(() => getComputedStyle(document.documentElement).fontSize);
      if (before === after) throw new Error(`root font size stayed ${before}`);
      return `${before} -> ${after}`;
    });
    await record("settings save and survive a reload", async () => {
      await until(desk, async () => Number(await desk.evaluate(async () => (await (await fetch("/api/settings")).json()).textScale)) === 1.2, "the core to save textScale 1.2", 10_000);
      await desk.reload();
      await until(desk, async () => (await desk.evaluate(() => getComputedStyle(document.documentElement).fontSize)) === "19.2px", "the saved font size after reload", 10_000);
      return "textScale 1.2 kept";
    });
    await record("the motion switch turns motion off and stays off", async () => {
      await openLook();
      await desk.locator('[data-st="motion:off"]').click();
      await desk.waitForTimeout(700);
      if (await desk.evaluate(() => document.documentElement.dataset.motion) !== "off") throw new Error("motion did not turn off");
      await desk.reload(); await desk.waitForTimeout(1200);
      if (await desk.evaluate(() => document.documentElement.dataset.motion) !== "off") throw new Error("motion did not survive a reload");
      await openLook();
      await desk.locator('[data-st="motion:full"]').click();
      await desk.waitForTimeout(500);
    });

    // --- chat on the scripted echo engine (CAESAROS_TEST_ENGINE=1 above): answers, Stop, the waiting queue, Local only, Polish ---
    // The echo engine is local by nature and answers "echo: <message>" a word at a time, so Stop and a second message have time to land.
    // goto/reload wait for "commit" only: this page can hold the load event for a long time in a busy browser.
    const longMsg = Array.from({ length: 14 }, (_, i) => `w${i}`).join(" ");
    const echoThread = async (pg: PageLike) => {
      const id = await pg.evaluate(async () => (await (await fetch("/api/chat/sessions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ engine: "echo", title: "readiness echo" }) })).json()).id);
      await (pg as any).reload({ waitUntil: "commit" }); await pg.waitForTimeout(2500);
      await pg.evaluate((sid) => { const w = window as any; w.open_({ k: "chat", id: sid }); S.cur = sid; w.render(); }, id);
      await pg.waitForTimeout(700);
      return id as string;
    };
    const say = async (pg: PageLike, text: string) => { await pg.locator("#inp").fill(text); await pg.locator('[data-nx="send"]').click(); };
    const chatText = (pg: PageLike) => pg.evaluate(() => (document.querySelector("#msgs") as HTMLElement | null)?.innerText ?? "");
    let eid = "";
    await record("chat answers on the echo engine", async () => {
      eid = await echoThread(desk);
      await say(desk, "hello readiness");
      await until(desk, async () => (await chatText(desk)).includes("echo: hello readiness"), "the echo answer");
      return "the answer streamed into the conversation";
    });
    await record("Stop ends an answer in progress", async () => {
      await say(desk, longMsg);
      await until(desk, async () => (await desk.evaluate(async () => (await (await fetch("/api/running")).json()).count)) > 0, "a running turn");
      await openApp(desk, "Horde desk");
      await desk.locator('[data-rd="hdstop"]').waitFor({ state: "visible", timeout: 10_000 });
      // shortcut: the Stop button pulses while a turn runs, so Playwright calls it unstable; force the click
      await desk.locator('[data-rd="hdstop"]').click({ force: true });
      await until(desk, async () => (await desk.evaluate(async () => (await (await fetch("/api/running")).json()).count)) === 0, "the turn to stop");
      await desk.waitForTimeout(1500);
      await desk.evaluate((sid) => { const w = window as any; w.open_({ k: "chat", id: sid }); S.cur = sid; w.render(); }, eid);
      await desk.waitForTimeout(600);
      const full = (await chatText(desk)).split("w13").length - 1;       // the person's own message carries w13 once; the echo of it would be the second
      if (full >= 2) throw new Error("the whole answer arrived: Stop did nothing");
      return "the turn ended before the last word";
    });
    await record("a message sent while an answer runs waits with Cancel, then starts by itself", async () => {
      await say(desk, longMsg);
      await desk.waitForTimeout(500);
      await say(desk, "second one");
      await until(desk, async () => (await desk.locator("[data-qcancel]").count()) === 1, "the waiting message with its Cancel button");
      await say(desk, "third one");
      await until(desk, async () => (await desk.locator("[data-qcancel]").count()) === 2, "a second waiting message");
      await desk.locator("[data-qcancel]").last().click();
      await until(desk, async () => (await desk.locator("[data-qcancel]").count()) === 1, "Cancel to remove the third message");
      await until(desk, async () => (await chatText(desk)).includes("echo: second one"), "the waiting message to start and answer", 45_000);
      if ((await chatText(desk)).includes("echo: third one")) throw new Error("a cancelled message was answered");
      return "queued, cancelled one dropped, the other answered on its own";
    });
    await record("the Cloud/Local switch keeps answers local and the echo engine still answers", async () => {
      await desk.locator("[data-route-toggle]").first().click();
      await until(desk, async () => (await desk.evaluate(async () => (await (await fetch("/api/settings")).json()).localOnly)) === true, "Local only to be saved");
      await until(desk, async () => (await desk.evaluate(() => document.documentElement.dataset.routing)) === "local", "the page to switch to the local colour");
      await desk.waitForTimeout(900);                        // the switch re-draws the page once more after the settings answer; typing before that is lost
      await say(desk, "stay home");
      try { await until(desk, async () => (await chatText(desk)).includes("echo: stay home"), "an answer with Local only on"); }
      catch (e) { throw new Error(`${(e as Error).message}; the conversation ends: ${(await chatText(desk)).replace(/\s+/g, " ").slice(-240)}`); }
      const targets = await desk.evaluate(async () => (await (await fetch("/api/chat-targets")).json()));
      const cloudOk = (targets as { scope?: string; ok?: boolean }[]).filter((t) => t.scope === "cloud" && t.ok);
      if (cloudOk.length) throw new Error(`Local only is on but a cloud engine is still offered: ${JSON.stringify(cloudOk[0])}`);
      await desk.locator("[data-route-toggle]").first().click();
      await until(desk, async () => (await desk.evaluate(async () => (await (await fetch("/api/settings")).json()).localOnly)) === false, "Local only to switch off");
      await until(desk, async () => (await desk.evaluate(() => document.documentElement.dataset.routing)) === "cloud", "the page to switch back");
      await desk.waitForTimeout(900);
      return "echo answered with Local only on, no cloud engine offered, switched back";
    });
    await record("one box: Arrow up and down bring back what was sent", async () => {
      await desk.evaluate((sid) => { const w = window as any; w.open_({ k: "chat", id: sid }); S.cur = sid; w.render(); }, eid);
      await desk.waitForTimeout(500);
      await desk.locator("#inp").fill(""); await desk.locator("#inp").focus();
      await desk.keyboard.press("ArrowUp");
      const last = await desk.evaluate(() => (document.getElementById("inp") as HTMLTextAreaElement).value);
      if (last !== "stay home") throw new Error(`Arrow up gave "${last}"`);
      await desk.keyboard.press("ArrowUp");
      const before = await desk.evaluate(() => (document.getElementById("inp") as HTMLTextAreaElement).value);
      if (before === last) throw new Error("a second Arrow up did not go further back");
      await desk.keyboard.press("ArrowDown"); await desk.keyboard.press("ArrowDown");
      const draft = await desk.evaluate(() => (document.getElementById("inp") as HTMLTextAreaElement).value);
      if (draft !== "") throw new Error(`Arrow down did not return to the empty draft: "${draft}"`);
    });
    await record("one box: ./name starts a new conversation and sends the rest", async () => {
      await say(desk, "./garden plant tomatoes");
      await until(desk, async () => (await chatText(desk)).includes("echo: plant tomatoes"), "the first answer in the new conversation");
      const title = await desk.evaluate(() => THREADS[0].t);
      if (title !== "garden") throw new Error(`the new conversation is called "${title}"`);
      const saved = await desk.evaluate(async () => ((await (await fetch("/api/chat/sessions")).json()) as { title: string }[]).some((x) => x.title === "garden"));
      if (!saved) throw new Error("the title was not saved on the core");
    });
    await record("one box: the placeholder points to a waiting approval", async () => {
      const ph = await desk.evaluate(() => { S.waiting = [{ k: "x", t: "t", th: S.cur }]; (window as any).render(); const v = (document.getElementById("inp") as HTMLTextAreaElement).placeholder; S.waiting = []; (window as any).render(); return v; });
      if (!/approval/i.test(ph)) throw new Error(`placeholder: "${ph}"`);
    });
    await record("switching to Polski changes the texts", async () => {
      await openApp(desk, "Settings");
      await desk.locator('[data-st="open:lang"]').waitFor({ state: "visible", timeout: 15_000 });
      await desk.locator('[data-st="open:lang"]').click();
      const diacritics = () => desk.evaluate(() => (document.body.innerText.match(/[ąćęłńóśźż]/gi) ?? []).length);
      const before = await diacritics();
      await desk.locator('[data-st="lang:pl"]').click();
      await until(desk, async () => (await diacritics()) > before, "Polish text on the page", 25_000);
      if (await desk.evaluate(() => document.documentElement.lang) !== "pl") throw new Error("the page language did not change");
      await desk.locator('[data-st="lang:en"]').click(); await desk.waitForTimeout(1500);
      return "Polish letters appeared; switched back to English";
    });
    await record("phone: a chat answers on the echo engine at 390x844", async () => {
      await (phone as any).goto(`${BASE}/?noboot`, { waitUntil: "commit" }); await phone.waitForTimeout(2000);
      await echoThread(phone);
      await say(phone, "from the phone");
      await until(phone, async () => (await chatText(phone)).includes("echo: from the phone"), "the answer on the phone");
    });

    // --- the terminal: a real shell in the pane, End with Undo, and a reload picks the same shell up again ---
    await record("Terminal: a real shell answers, END can be undone, a reload keeps the same shell", async () => {
      await desk.evaluate(() => { S.term = true; (window as any).render(); });
      await desk.waitForTimeout(2500);
      const screen = () => desk.evaluate(() => [...document.querySelectorAll(".rt .xterm-rows > div")].map((d) => d.textContent).join("\n"));
      const pid = async () => { await desk.locator(".rt").click(); await desk.keyboard.type("echo PID=$$\n"); await desk.waitForTimeout(900); return ((await screen()).match(/PID=\d+/g) ?? []).pop() ?? ""; };
      const p1 = await pid(); if (!p1) throw new Error("the shell printed nothing");
      await (desk as any).reload({ waitUntil: "commit" }); await desk.waitForTimeout(2500);
      await desk.evaluate(() => { S.term = true; (window as any).render(); }); await desk.waitForTimeout(2500);
      const p2 = await pid(); if (p1 !== p2) throw new Error(`a reload started a new shell (${p1} then ${p2})`);
      await desk.locator('[data-rt="end"]').first().click(); await until(desk, async () => (await desk.locator('[data-rt="undo"]').count()) === 1, "the Undo button");
      await desk.locator('[data-rt="undo"]').click(); await desk.waitForTimeout(1500);
      const p3 = await pid(); if (p3 !== p1) throw new Error(`Undo did not bring the same shell back (${p1} then ${p3})`);
      await desk.evaluate(() => { S.term = false; (window as any).render(); });
      return `one shell (${p1}) through a reload and an undo`;
    });

    // --- checks that cannot run on a throwaway instance ---
    skip("approvals return to a crew member and a real engine answers (Caesar, Claude Code, Codex)", "the echo engine above covers chat, Stop, the queue and Local only; a real engine is the owner's signed-in tool, which a readiness pass must not spend");
    skip("his data: 944 notes with folders, archived chats, crew of 8", "needs the owner's data directory; a throwaway instance starts empty by design");
    skip("Tasks and Board show a real plan and what runs", "needs the owner's real Board and Plan note; a throwaway instance has none");
    skip("Computer works (arm, windows, type, pointer)", "needs this machine's sudo and desktop setup, not a throwaway core");
    skip("phone: approvals and Brain with real data usable in two taps", "needs real data; the phone chat and the render pass above cover chat and the apps opening at 390x844");
    skip("sync between PC and the VPS instance holds risky changes", "needs the VPS (10.2, 10.8) and a pairing; not reachable from a throwaway core");
    skip("release lines: clean repo, leak check, LICENSE, README, notices, install gate, Hermes and a second agent, offline model", "public-release acts and other machines; measured by their own tools, and the release itself stays the owner's act");

    // --- the repo's own gates, run as commands ---
    const runCmd = async (argv: string[], timeoutMs: number) => {
      const p = spawn(argv, { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
      const out: string[] = [];
      const read = async (s: ReadableStream<Uint8Array>) => { for await (const c of s) out.push(new TextDecoder().decode(c)); };
      void read(p.stdout as ReadableStream<Uint8Array>); void read(p.stderr as ReadableStream<Uint8Array>);
      const timer = setTimeout(() => p.kill(), timeoutMs);
      const code = await p.exited; clearTimeout(timer);
      return { code, out: out.join("") };
    };
    await record("tsc --noEmit -p . passes", async () => {
      const { code, out } = await runCmd(["bunx", "tsc", "--noEmit", "-p", "."], 300_000);
      if (code !== 0) throw new Error(out.trim().split("\n").slice(0, 4).join(" | "));
    });
    await record("bun test tests passes", async () => {
      const { code, out } = await runCmd(["bun", "test", "tests"], 600_000);
      if (code !== 0) throw new Error(out.trim().split("\n").filter((l) => /fail|error/i.test(l)).slice(0, 4).join(" | ") || "bun test failed");
      const summary = out.split("\n").find((l) => /\d+ pass/.test(l));
      return summary?.trim() ?? "";
    });

    // --- the table and the score, before cleanup: closing a browser can hang on Wayland ---
    const width = Math.max(...checks.map((c) => c.name.length), 8);
    for (const c of checks) console.log(`${c.state.toUpperCase().padEnd(4)}  ${c.name.padEnd(width)}  ${c.detail}`);
    const runnable = checks.filter((c) => c.state !== "skip");
    const passed = runnable.filter((c) => c.state === "pass").length;
    const pct = runnable.length ? (100 * passed) / runnable.length : 0;
    console.log(`\n${passed}/${runnable.length} runnable checks passed = ${pct.toFixed(1)}%  (${checks.length - runnable.length} skipped)`);
    const skipped = checks.filter((c) => c.state === "skip");
    if (skipped.length) console.log(`NOTE: ${skipped.length} must-pass gate lines were skipped; this score alone is not READY. See the plan's gate list.`);
    const failed = checks.filter((c) => c.state === "fail");
    if (failed.length) console.log(`failing: ${failed.map((c) => c.name).join(" | ")}`);
    await Promise.race([cleanup(), new Promise((r) => setTimeout(r, 5000))]);
    process.exit(pct < 98 ? 1 : 0);
  } catch (e) {
    await cleanup();
    console.error(`readiness could not run: ${(e as Error).message}`);
    if (logs.length) console.error(logs.join("").slice(-2000));
    process.exit(2);
  }
}

await main();
