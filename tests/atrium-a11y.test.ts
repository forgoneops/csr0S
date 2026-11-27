// Cheap guards for the accessibility pass: each one holds a defect that was measured in a browser and fixed.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const read = (f: string) => readFileSync(join(import.meta.dir, "..", "web", "atrium", f), "utf8");

describe("Atrium accessibility", () => {
  test("a field with no placeholder to fall back on has a name", () => {
    const bare: string[] = [];
    for (const f of ["real.js", "gateway.js", "business.js", "studio.js", "lair.js", "skills.js", "storage.js", "pg-schedule.js"]) {
      const src = read(f);
      for (const m of src.matchAll(/<(?:input|textarea|select)\b(?:\$\{(?:[^{}]|\{[^{}]*\})*\}|[^>])*>/g)) {
        const before = src.slice(Math.max(0, m.index - 400), m.index);
        const wrapped = before.lastIndexOf("<label") > before.lastIndexOf("</label>");
        const id = m[0].match(/ id="([^"]+)"/)?.[1];
        if (!wrapped && !(id && src.includes(`for="${id}"`)) && !/aria-label|placeholder=|type="(hidden|file|submit|button)"|\bhidden\b/.test(m[0])) bare.push(`${f}: ${m[0].slice(0, 90)}`);
      }
    }
    expect(bare).toEqual([]);
  });

  test("focus is only restored to an unambiguous twin of the replaced control", () => {
    expect(read("a11y.js")).toContain("return m.length === 1 ? m[0] : null;");
  });

  test("the hidden offline banner is out of the Tab order", () => {
    const css = read("kit.css");
    expect(css).toMatch(/^\.nx-offline\{[^}]*visibility:hidden/m);
    expect(css).toMatch(/html\[data-core-down\] \.nx-offline\{[^}]*visibility:visible/);
  });

  test("the chat dock draws its focus ring inside its cut corners", () => {
    const rule = read("dock.css").match(/\.cdk \.cdk-launch:focus-visible[^{]*\{([^}]*)\}/)![1];
    expect(rule).toMatch(/outline-offset:\s*-\d/);
  });

  test("the top-bar search button keeps a name when its text is hidden", () => {
    expect(read("index.html")).toContain('class="shell-search" data-nx="pal" aria-label=');
  });
});

const home = homedir();
const npx = join(home, ".npm", "_npx");
const playwright = [process.env.PLAYWRIGHT_CORE ?? "", join(import.meta.dir, "..", "node_modules", "playwright-core"), "/tmp/csr-qa/node_modules/playwright-core", ...(existsSync(npx) ? readdirSync(npx).map((d) => join(npx, d, "node_modules", "playwright-core")) : [])].map((x) => x && join(x, "index.js")).find((x) => x && existsSync(x)) ?? "";
const chromium = (() => {
  const dir = join(home, ".cache", "ms-playwright");
  return existsSync(dir) ? readdirSync(dir).filter((x) => x.startsWith("chromium-")).sort().reverse().map((x) => join(dir, x, "chrome-linux64", "chrome")).find(existsSync) : undefined;
})();
const canRunBrowser = !!playwright && !!chromium;

describe.skipIf(!canRunBrowser)("Atrium accessibility focus in a real browser", () => {
  let browser: any;
  beforeAll(async () => {
    const pw = await import(pathToFileURL(playwright).href);
    browser = await pw.chromium.launch({ executablePath: chromium, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  });
  afterAll(async () => { await browser?.close(); });

  test("modal focus skips aria-hidden descendants on entry and Tab wrap", async () => {
    const page = await browser.newPage();
    await page.setContent('<button id="trigger">Open</button>');
    await page.addScriptTag({ path: join(import.meta.dir, "..", "web", "atrium", "a11y.js") });
    await page.locator("#trigger").focus();
    await page.evaluate(() => {
      window.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      const dialog = document.createElement("div");
      dialog.setAttribute("role", "dialog");
      dialog.setAttribute("aria-modal", "true");
      dialog.innerHTML = '<div aria-hidden="true"><button id="hidden-first">Hidden</button></div><button id="first">First</button><button id="last">Last</button>';
      document.body.append(dialog);
    });
    await page.waitForFunction(() => ["hidden-first", "first"].includes((document.activeElement as HTMLElement).id));
    expect(await page.evaluate(() => (document.activeElement as HTMLElement).id)).toBe("first");
    await page.locator("#last").focus();
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => (document.activeElement as HTMLElement).id)).toBe("first");
    await page.close();
  });
});
