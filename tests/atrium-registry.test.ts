// The Atrium's module registry: every script named in index.html registers its views through register()
// instead of assigning OG[...] itself. Loading them in the page's own order must work, and a duplicate
// module id or a second owner of a view must throw. The shell's own globals (index.html's inline script)
// are stubbed: this test is about registration, not about drawing the page.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ATRIUM = join(import.meta.dir, "..", "web", "atrium");
const html = readFileSync(join(ATRIUM, "index.html"), "utf8");
// the page's script order, without the vendor bundles this test does not need
const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]).filter((s) => !s.startsWith("vendor/"));

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

const empty = { ok: true, status: 200, json: async () => fake(), blob: async () => fake(), text: async () => "" };

function shell(): Record<string, unknown> {
  return {
    window: fake(), document: fake(),
    navigator: { hardwareConcurrency: 8, deviceMemory: 8, serviceWorker: { register: async () => ({}) }, clipboard: { writeText: async () => {} } },
    location: { search: "", href: "", origin: "http://atrium", pathname: "/" },
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    sessionStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    fetch: async () => empty, setTimeout, clearTimeout, setInterval: () => 0, clearInterval: noop,
    requestAnimationFrame: () => 0, matchMedia: () => ({ matches: false, addEventListener: noop }),
    history: { pushState: noop, replaceState: noop }, CustomEvent: function () {}, Event: function () {},
    Image: fake(), Audio: fake(), URL, getComputedStyle: () => ({}),
    SETTINGS: {}, root: fake(), BODY: fake(), S: { tabs: {}, act: "chat", cur: "", waiting: [] },
    $: () => null, $$: () => [], esc: (s: string) => String(s), I: () => "", render: noop,
    topHtml: () => "", viewFor: () => "", tkey: () => "", chatView: () => "", open_: noop, wsView: () => "", WIDGETS: [], phone: () => false,
    CREW: [], C: {}, THREADS: [], WSN: [], FEED: [],
  };
}

function load(files: string[]): { OG: Record<string, unknown>; OG_MODULES: Map<string, string[]>; register: (m: any) => void } {
  const code = files.map((f) => readFileSync(join(ATRIUM, f), "utf8")).join("\n;\n") + "\n;return { OG, OG_MODULES, register };";
  const sb = shell();
  return new Function(...Object.keys(sb), code)(...Object.values(sb));
}

describe("Atrium module registry", () => {
  test("every script loads in the page's order and registers its views", () => {
    const { OG, OG_MODULES } = load(scripts);
    for (const s of scripts) expect(html).toContain(`<script src="${s}"></script>`);
    expect(OG_MODULES.size).toBe(13);
    expect([...OG_MODULES.keys()]).toEqual(["pages", "ns", "ns-mobile", "ns-gateway", "setup", "notes", "mail", "settings", "computer", "real", "board", "dock", "hof3d"]);
    expect(Object.keys(OG).length).toBe(53);
    for (const name of Object.keys(OG)) expect(typeof OG[name]).toBe("function");
  });

  test("a duplicate module id throws", () => {
    const { register } = load(["og.js", "registry.js"]);
    register({ id: "twice", views: { A: noop } });
    expect(() => register({ id: "twice", views: { B: noop } })).toThrow(/registered twice/);
  });

  test("a second module registering a view another module owns throws", () => {
    const { OG, register } = load(["og.js", "registry.js"]);
    register({ id: "owner", views: { A: noop }, owns: ["A"] });
    expect(OG.A).toBe(noop);
    expect(() => register({ id: "thief", views: { A: noop } })).toThrow(/owned by "owner"/);
    expect(OG.A).toBe(noop); // the owner keeps it
    register({ id: "owner2", views: { B: noop }, owns: ["B"] });
    expect(OG.B).toBe(noop);
  });
});
