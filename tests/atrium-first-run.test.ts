// Plan 8.9, beginner first: the left menu a fresh install shows, and the run chip that must not
// offer a VPS nobody connected. Loaded in the page's own order in a fake shell, like
// tests/atrium-registry.test.ts does, then the rail and the chip are read as markup.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ATRIUM = join(import.meta.dir, "..", "web", "atrium");
const html = readFileSync(join(ATRIUM, "index.html"), "utf8");

const noop = () => {};
// any element or object the scripts touch: every property is another fake, every call returns one
function fake(): any {
  const f: any = new Proxy(function () {}, {
    get(_t, k) {
      if (k === Symbol.iterator) return function* () {};
      if (k === "then") return undefined;
      if (k === Symbol.toPrimitive) return () => "";
      if (k === "classList") return { add: noop, remove: noop, toggle: noop, contains: () => false };
      if (k === "dataset" || k === "style") return {};
      if (k === "textContent" || k === "value" || k === "innerHTML" || k === "href") return "";
      if (k === "length") return 0;
      return f;
    },
    set() { return true; },
    apply() { return f; },
    construct() { return f; },
  });
  return f;
}

/** Loads og.js, registry.js, pages.js and ns.js in the page's order. `groups` is what the device
 *  remembered as opened, `remote` is whether a gateway is paired. */
function load({ groups = "", remote = false }: { groups?: string; remote?: boolean } = {}) {
  const document = fake();
  document.documentElement.dataset = {};
  const shell: Record<string, unknown> = {
    window: { REMOTE: remote }, document,
    localStorage: { getItem: (k: string) => (k === "caesaros-menu-groups" ? groups || null : null), setItem: noop, removeItem: noop },
    navigator: { hardwareConcurrency: 8, deviceMemory: 8 },
    location: { search: "", href: "", origin: "http://atrium" },
    sessionStorage: { getItem: () => null, setItem: noop },
    fetch: async () => ({ ok: true, json: async () => fake() }),
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval: noop, requestAnimationFrame: () => 0,
    matchMedia: () => ({ matches: false, addEventListener: noop }),
    S: { tabs: [{ k: "ws" }], act: 0, cur: "", waiting: [] },
    CREW: [], C: {}, THREADS: [], WSN: ["Main"], FEED: [],
    $: () => null, $$: () => [], esc: (s: string) => String(s), I: () => "", render: noop,
    scene: () => "", setMotion: noop, phone: () => false, topHtml: () => "",
  };
  const code = ["og.js", "registry.js", "pages.js", "ns.js"].map((f) => readFileSync(join(ATRIUM, f), "utf8")).join("\n;\n")
    + "\n;return { railHtml, ogMode };";
  return new Function(...Object.keys(shell), code)(...Object.values(shell)) as { railHtml: () => string; ogMode: () => string };
}

const entries = (rail: string) => (rail.match(/<button class="ns-(?:it|gh)/g) || []).length;

describe("a fresh install gets a short menu", () => {
  test("the left menu is Start, Home, Chat, Notes, Settings and More, and at most eight entries", () => {
    const { railHtml } = load();
    const rail = railHtml();
    expect(entries(rail)).toBeLessThanOrEqual(8);
    for (const name of ["Start", "Home", "Chat", "Notes", "Settings", "More"]) expect(rail).toContain(`>${name}<`);
    expect(rail).not.toContain('data-ns="grp:');   // no group is shown before it is opened
  });

  test("a group the person opened stays in the menu across a reload", () => {
    const { railHtml } = load({ groups: JSON.stringify(["Day"]) });
    const rail = railHtml();
    expect(rail).toContain('data-ns="grp:Day"');
    expect(rail).toContain(">Board<");
    expect(rail).toContain(">More<");                // the rest is still one tap away
    expect(entries(rail)).toBeLessThanOrEqual(8 + 8);
  });

  test("the Latin second name is a caption, never the name", () => {
    const rail = load({ groups: JSON.stringify(["Day"]) }).railHtml();
    for (const title of rail.match(/title="[^"]*"/g) || []) expect(title).not.toContain("·");
    expect(rail).toContain('<small class="ns-lab">Album</small>');   // Visual mode keeps the caption
    expect(readFileSync(join(ATRIUM, "ns.css"), "utf8")).toContain("html.nx-simple .ns-side small.ns-lab");
  });
});

describe("what the top bar says is true", () => {
  test("a VPS is offered only when a gateway is paired", () => {
    expect(load({ remote: false }).ogMode()).not.toContain(">VPS<");
    expect(load({ remote: true }).ogMode()).toContain(">VPS<");
  });

  test("the status line is a plain sentence and the workspace bar starts with purpose workspaces", () => {
    expect(html).toContain("Engines ready: ");
    expect(html).not.toContain("engines answering");
    expect(html).toContain("const WSN=['Home','Planning','Knowledge','Business','System','Crew'];");
  });
});
