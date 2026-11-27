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
    fetch: async () => empty, setTimeout: () => 0, clearTimeout: noop,   // inert: a real timer (tour.js autostart) fires into whichever test file runs next
    setInterval: () => 0, clearInterval: noop,
    requestAnimationFrame: () => 0, MutationObserver: class { observe() {} }, matchMedia: () => ({ matches: false, addEventListener: noop }),
    history: { pushState: noop, replaceState: noop }, CustomEvent: function () {}, Event: function () {},
    Image: fake(), Audio: fake(), URL, getComputedStyle: () => ({}),
    SETTINGS: {}, root: fake(), BODY: fake(), S: { tabs: {}, act: "chat", cur: "", waiting: [] },
    $: () => null, $$: () => [], esc: (s: string) => String(s), I: () => "", render: noop,
    topHtml: () => "", viewFor: () => "", tkey: () => "", chatView: () => "", open_: noop, wsView: () => "", WIDGETS: [], phone: () => false,
    CREW: [], C: {}, THREADS: [], WSN: [], FEED: [], APPS: { Talk: [], System: [] },
  };
}

function load(files: string[]): { OG: Record<string, unknown>; OG_MODULES: Map<string, string[]>; register: (m: any) => void; OGCORE: Set<string>; MODULE_GROUPS: { apps: string[] }[] } {
  const code = files.map((f) => readFileSync(join(ATRIUM, f), "utf8")).join("\n;\n") + "\n;return { OG, OG_MODULES, register, OGCORE: typeof OGCORE === 'undefined' ? null : OGCORE, MODULE_GROUPS: typeof MODULE_GROUPS === 'undefined' ? null : MODULE_GROUPS };";
  const sb = shell();
  return new Function(...Object.keys(sb), code)(...Object.values(sb));
}

describe("Atrium module registry", () => {
  test("every script loads in the page's order and registers its views", () => {
    const { OG, OG_MODULES } = load(scripts);
    for (const s of scripts) expect(html).toContain(`<script src="${s}"></script>`);
    expect(OG_MODULES.size).toBe(29);
    expect([...OG_MODULES.keys()]).toEqual(["finance", "pages", "ns", "ns-mobile", "ns-gateway", "ideas", "goals", "toolgraph", "setup", "notes", "mail", "media", "settings", "computer", "library", "real", "storage", "pg-sys", "business-modules", "studio", "skills", "get-started", "board", "pg-schedule", "lair", "dock", "live", "conversations", "hof3d"]);
    expect(Object.keys(OG).length).toBe(59);
    for (const name of Object.keys(OG)) expect(typeof OG[name]).toBe("function");
  });

  test("the Business, Fleet and Leads pages draw without throwing, before any data arrives", () => {
    const { OG } = load(scripts);
    for (const n of ["Business", "Fleet", "Leads"]) expect(typeof (OG[n] as () => unknown)()).toBe("string");
  });

  test("optional module clients call their Hono mount points without a trailing slash", () => {
    const finance = readFileSync(join(ATRIUM, "finance.js"), "utf8");
    const toolgraph = readFileSync(join(ATRIUM, "toolgraph.js"), "utf8");
    expect(finance).toContain("api(path='', method='GET'");
    expect(finance).toContain("fetch('/api/p/finance'+path");
    expect(toolgraph).toContain("fetch('/api/p/toolgraph')");
    expect(toolgraph).not.toContain("fetch('/api/p/toolgraph/')");
  });

  test("the Goals and Ideas pages come from their own modules", () => {
    const { OG_MODULES } = load(scripts);
    expect(scripts.indexOf("goals.js")).toBeGreaterThan(scripts.indexOf("pages.js")); // past the placeholder layer
    expect(OG_MODULES.get("real")).not.toContain("Goals");
    expect(OG_MODULES.get("real")).not.toContain("Ideas");
    // the Goals page's repaint and click handlers live outside page(): they need request() at module scope
    const goals = readFileSync(join(ATRIUM, "goals.js"), "utf8");
    expect(goals.indexOf("const request =")).toBeLessThan(goals.indexOf("async function page()"));
  });

  // pages.js is the placeholder layer any module may replace. Past it, a view has one owner unless listed here,
  // in load order (the last one draws the page). A new entry means a later script silently took over a page.
  test("every view has one owner, or a documented override", () => {
    const OVERRIDES: Record<string, string> = {
      Start: "ns > setup", Settings: "ns > settings > real", Notifications: "ns > real", Search: "ns > real", Gateway: "ns-gateway > real",
      // pg-sys.js wraps real.js's view (adds tiles, skeleton and error state on top of it)
      Meetings: "real > pg-sys", News: "real > pg-sys", "Image Studio": "real > pg-sys", Mirror: "real > pg-sys", Updates: "real > pg-sys",
      // business.js replaces the plain lists
      Business: "real > business-modules", Leads: "real > business-modules",
    };
    const owners: Record<string, string[]> = {};
    for (const [id, views] of load(scripts).OG_MODULES) if (id !== "pages") for (const v of views) (owners[v] ??= []).push(id);
    const shared = Object.fromEntries(Object.entries(owners).filter(([, m]) => m.length > 1).map(([v, m]) => [v, m.join(" > ")]));
    expect(shared).toEqual(OVERRIDES);
  });

  // the test above leaves "pages" out, so it cannot see the placeholder layer loading late and drawing demo data over a module
  test("the placeholder layer never replaces a module page", () => {
    const ids = [...load(scripts).OG_MODULES];
    const at = ids.findIndex(([id]) => id === "pages"), placeholders = new Set(ids[at][1]);
    expect(ids.slice(0, at).flatMap(([id, views]) => [...views].filter((v) => placeholders.has(v)).map((v) => `${id}: ${v}`))).toEqual([]);
  });

  test("every view can be opened: core, or behind a module switch", () => {
    const { OG, OGCORE, MODULE_GROUPS } = load(scripts);
    const optional = new Set(MODULE_GROUPS.flatMap((g) => g.apps));
    // every non-core view sits in a MODULE_GROUPS switch
    expect(Object.keys(OG).filter((v) => !OGCORE.has(v) && !optional.has(v)).sort()).toEqual([]);
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
