// Drift test: every string these pages put on screen has an entry in the shipped Polish catalog.
// It reads the source (tests/helpers/ui-strings.ts) and normalises with the same keyOf as the page.
// A new page or file: add it to PAGES, SECTIONS or SERVER below.
//
// What it CANNOT see (check these by switching the page to Polish and reading POST /api/i18n/pl/missing):
//  - text built at run time: a template node with ${…} in it ("${n} of ${m}"), or pieces joined with +;
//    a literal piece is only caught if it reads like words on its own;
//  - one lowercase word on its own ("clean", "installed"): it looks like an id;
//  - server text that is not an error/message/note literal in the files listed in SERVER, and error codes;
//  - text drawn on a canvas, CSS content, and files or page sections that are not listed here.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { keyOf } from "../core/i18n";
import { literals, uiTexts } from "./helpers/ui-strings";

const ROOT = join(import.meta.dir, "..");
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const catalog = JSON.parse(read("web/atrium/locales/pl.json")) as Record<string, string>;

const PAGES = ["studio", "studio-logic", "business", "goals", "ideas", "scheduling", "pg-schedule", "notes", "graph", "library", "lair", "skills", "storage", "getstarted", "live", "setup", "gateway", "dock",
  "conversations", "chat-meter", "brief", "notify", "egress", "permissions", "notes-autosave", "model-caps", "settings", "datepick", "toolgraph", "finance"].map((n) => `web/atrium/${n}.js`);
/** Shared files: only the part that draws one of these pages, between two markers. */
const SECTIONS = [
  { file: "web/atrium/real.js", from: "/* ---------- Gateway (keys)", to: "/* ---------- Settings:" },          // Gateway and Library
  { file: "web/atrium/real.js", from: "/* ---------- Reading: a plain", to: "/* ---------- Clipboard:" },              // the plain-list page
  { file: "web/atrium/real.js", from: "/* ---------- Command: your own prompts", to: "/* ---------- Orchestration" },  // Praetorium, Prompts tab
];
/** Where the messages these pages show come from. */
const SERVER = ["plugins/business/server.ts", "plugins/fleet/server.ts", "plugins/leads/server.ts", "core/modules/goals/server.ts", "core/modules/goals/model.ts", "core/modules/ideas/server.ts", "core/modules/scheduling/server.ts", "core/egress.ts"];
/** The part of the core's server file that names the destinations "Where it can connect" lists. */
const DESTINATIONS = { file: "core/server.ts", from: "{ what: \"Ollama\"", to: "tools: async" };

/** Literals that read like text but never reach the screen as interface text. Keep it short, and say why. */
const IGNORE = new Set<string>([
  "codex login", "hermes model", "sudo pacman -S ollama && sudo systemctl enable --now ollama",   // shell commands (setup.js)
  "Projects/Atrium", "Projects/Brain", "Decisions/Local first", "Agents/Alpha", "Agents/Beta", "Research/Graphs", "Research/Recall", "Journal/Monday", "Journal/Tuesday",   // note names of the sample map, drawn on a canvas (graph.js)
  "Uses a banned",   // that lint line quotes the person's own phrase, so it is data-no-i18n (studio.js)
  "Created",         // a startsWith() check, not text (scheduling.js)
  "Hello, this is Caesar.", "Hello. This is how I will read answers.", "Dzień dobry, tu Caesar.", "Dzień dobry. Tak będę czytać odpowiedzi.",   // spoken samples: settings.js picks the language itself
  "Ollama ·",        // a check against the model menu's own markup (model-caps.js)
  "Notification",    // the browser API's name (notify.js, permissions.js)
]);

const section = (s: { file: string; from: string; to: string }) => { const src = read(s.file), a = src.indexOf(s.from), b = src.indexOf(s.to, a + 1); if (a < 0 || b < 0) throw new Error(`markers moved in ${s.file}`); return src.slice(a, b); };

/** The keys a script's interface text would be looked up by. nsHead() prints its first argument in capitals, which is a key of its own. */
export function pageKeys(src: string): string[] {
  const heads = [...src.matchAll(/\bnsHead\('([^']+)'/g)].map((m) => m[1].toUpperCase());
  return [...literals(src).flatMap(uiTexts), ...heads].map(keyOf).filter((k): k is string => k !== null);
}
const serverKeys = (src: string) => [...src.matchAll(/\b(?:error|message|detail|note|what|when)\b[^\n"'`]{0,12}?(["'`])((?:(?!\1)[^\n\\$])+)\1/g)].map((m) => m[2]).filter((s) => /^\p{Lu}.* /u.test(s)).map(keyOf).filter((k): k is string => k !== null);
const missing = (keys: string[]) => [...new Set(keys)].filter((k) => !(k in catalog) && !IGNORE.has(k));

describe("UI catalog drift", () => {
  for (const f of PAGES) test(`every string of ${f} has a Polish entry`, () => { expect(missing(pageKeys(read(f)))).toEqual([]); });
  for (const s of SECTIONS) test(`every string of ${s.file} (${s.from.slice(14)}) has a Polish entry`, () => { const k = pageKeys(section(s)); expect(k.length).toBeGreaterThan(3); expect(missing(k)).toEqual([]); });
  test("every server message these pages show has a Polish entry", () => { const k = SERVER.flatMap((f) => serverKeys(read(f))); expect(k.length).toBeGreaterThan(10); expect(missing(k)).toEqual([]); });

  test("every destination the egress list names has a Polish entry", () => {
    const src = section(DESTINATIONS), kinds = [...src.matchAll(/what: `([^`:$]+): \$/g)].map((m) => m[1]);   // "Model server: <name>": the kind is ours
    expect(kinds.length).toBeGreaterThan(3);
    expect(missing([...serverKeys(src), ...kinds])).toEqual([]);
  });

  // The tour keeps its own two languages in tour.js and its card is data-no-i18n, so the catalog never sees it.
  test("every tour step, and every tour button, has its own Polish", () => {
    const js = read("web/atrium/tour.js"), part = (a: string, b: string) => { const i = js.indexOf(a); const j = js.indexOf(b, i); if (i < 0 || j < 0) throw new Error("tour.js moved"); return js.slice(i, j); };
    const { STEPS, WORDS } = new Function(`${part("const STEPS = [", "// what a step says")}${part("const WORDS = {", "\n  let i = 0")} return { STEPS, WORDS };`)() as { STEPS: string[][]; WORDS: Record<"en" | "pl", Record<string, unknown>> };
    expect(STEPS.length).toBeGreaterThan(10);
    for (const s of STEPS) expect([s[1], !!s[3], !!s[4] && s[4] !== s[2]]).toEqual([s[1], true, true]);
    expect(Object.keys(WORDS.pl)).toEqual(Object.keys(WORDS.en));
  });

  test("the reader sees markup text, the four attributes and bare messages, and not comments, classes or selectors", () => {
    const src = "// 'A comment'\nconst r = /'not a string'/; const a = `<p class=\"og-note\">New thing here</p><input placeholder=\"Type it\" id=\"x\">${esc('Nested words')}`; el.matches('input,textarea'); b.className = 'btn ghost'; toast('It broke.'); nsHead('Zed', '')";
    expect(pageKeys(src).sort()).toEqual(["It broke.", "Nested words", "New thing here", "Type it", "ZED", "Zed"]);
  });

  test("keyOf here is the keyOf the page runs (web/atrium/i18n.js)", () => {
    const js = read("web/atrium/i18n.js"), lines = [/const holes = .*;\n/, /const keyOf = .*;\n/].map((re) => re.exec(js)![0]).join("");
    const pageKeyOf = new Function(`${lines} return keyOf;`)() as (s: string) => string | null;
    const sample = [...PAGES.flatMap((f) => literals(read(f)).flatMap(uiTexts)), "  Page 3 of 10 ", "IV · 3", "https://example.com/a", "me@example.com", "notes.md", "x", "a".repeat(301)];
    expect(sample.length).toBeGreaterThan(500);
    for (const s of sample) expect([s, pageKeyOf(s)]).toEqual([s, keyOf(s)]);
  });

  test("a translation keeps its key's number holes and has no long dash", () => {
    const holes = (s: string) => (s.match(/\{n\d*\}/g) ?? []).sort().join();
    const mine = new Set(PAGES.flatMap((f) => pageKeys(read(f))));
    for (const k of mine) if (k in catalog) { expect([k, holes(catalog[k])]).toEqual([k, holes(k)]); expect([k, /—/.test(catalog[k]) && !/—/.test(k)]).toEqual([k, false]); }
  });
});
