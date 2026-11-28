// Drift test for the shortcut sheet (web/atrium/shortcuts.js). Every place the Atrium's sources read a key
// (an event's key or code, a key-name comparison, a keydown or keyup listener) must sit inside a snippet
// claimed below by a catalogue id, and every claimed snippet must still be there, exactly once. So a new,
// changed or removed binding fails here until the catalogue and this table say what the code does.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ATRIUM = join(import.meta.dir, "..", "web", "atrium");
const READS = [
  /\b(?:e|ev|event)\??\.(?:key|code|keyCode|which)\b/g,
  /(?:===|!==|\bcase)\s*(['"])(?:Escape|Enter|Tab|Backspace|Delete|Home|End|Page(?:Up|Down)|Arrow(?:Up|Down|Left|Right)|Space|Backquote)\1/g,
  /(?:addEventListener\(\s*['"]key(?:down|up|press)['"]|\.onkey(?:down|up|press)\b|attachCustomKeyEventHandler)/g,
];

type Claim = [file: string, from: string, to?: string]; // the source text from `from` through the next `to`
const BOUND: Record<string, Claim[]> = {};
const claim = (ids: string, ...c: Claim[]) => { for (const id of ids.split(" ")) (BOUND[id] ??= []).push(...c); };
claim("sheet", ["shortcuts.js", "dlg.addEventListener('keydown'", "dlg.close(); } });"], ["shortcuts.js", "document.addEventListener('keydown'", "e.altKey || e.defaultPrevented) return;"]);
claim("ask", ["dialogs.js", "d.addEventListener('keydown', e => e.stopPropagation());"]);
claim("palette", ["index.html", "document.addEventListener('keydown',e=>{ if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k')"]);
claim("terminal", ["index.html", "else if(e.ctrlKey&&(e.key==='`'||e.code==='Backquote'))"]);
claim("close", ["index.html", "else if(e.key==='Escape'){ pal(false);"]);
claim("close split-resize", ["og.js", "document.addEventListener('keydown', e => {\n  const sp = OGS.sp;", "render();\n}, true);"]);
claim("tab", ["index.html", "else if(e.ctrlKey&&!e.altKey&&e.key==='Tab'"]);
claim("workspace", ["index.html", "addEventListener('keydown', (e) => {\n    if (!e.altKey", "S.ws = n - 1;"]);
claim("palette-move palette-run", ["index.html", "$('#nxq').addEventListener('keydown'", "if(e.key==='Enter'&&pi[ps])"]);
claim("palette-trap close", ["index.html", "document.addEventListener('keydown', (e) => {\n     const o = ov();", "if (e.key !== 'Tab') return;"]);
claim("palette-trap", ["index.html", "if (e.shiftKey && document.activeElement === first)", "else if (!e.shiftKey && document.activeElement === last)"]);
claim("send newline suggest", ["index.html", "inp.addEventListener('keydown',e=>{ if(sug.length", "else if(e.key==='Enter'&&!e.shiftKey){"]);
claim("recall", ["bridge.js", "document.addEventListener('keydown', e => {\n    const el = e.target; if (!el || el.id !== 'inp'", "recall(el, e.key === 'ArrowUp' ? -1 : 1)"]);
claim("send", ["bridge.js", "document.addEventListener('keydown', e => { if (e.target && e.target.id === 'inp') setTimeout(growBox"]);
claim("talk voice-mode voice-cancel", ["bridge.js", "addEventListener('keydown', e => {\n    if (e.altKey && e.code === 'Space'", "if (e.code === 'Space' && ptt)"]);
claim("dock", ["dock.js", "document.addEventListener('keydown', (e) => {\n    if ((e.ctrlKey", "=== 'j')"]);
claim("dock-send newline dock-close", ["dock.js", "inp.addEventListener('keydown'", "else if (e.key === 'Escape')"]);
claim("dock-size", ["dock.js", "g.addEventListener('keydown'", "if (used) {"]);
claim("dock-move", ["dock.js", "launch.addEventListener('keydown'", "e.preventDefault(); D.r += d[0] * 24;"]);
claim("pin", ["ns.js", "document.addEventListener('keydown', e => { if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'b')"]);
claim("note-node note-save", ["notes.js", "document.addEventListener('keydown'", "e.key.toLowerCase() !== 's'"]);
claim("shelf pages lib-close", ["library.js", "document.addEventListener('keydown'", "else if (e.key === 'Enter') { e.preventDefault(); enter(); }"]);
claim("note-find", ["notes.js", "if (e.key === 'Enter' && e.target.id === 'nt-gq')"]);
claim("map-view", ["graph.js", "cv.addEventListener('keydown'", "else if (e.key === '0')"]);
claim("cal-day", ["pg-schedule.js", "document.addEventListener('keydown'", "[e.key]; if (!step) return;"]);
claim("date-pick", ["datepick.js", "document.addEventListener('keydown'", "if (!to) return;"]);
claim("mail-review", ["mail.js", "document.addEventListener('keydown'", "e.key === 'Enter')"]);
claim("media-view", ["media.js", "document.addEventListener('keydown'", "else if (e.key === 'ArrowLeft')"]);
claim("bell-close", ["live.js", "document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && L.open)"]);
claim("crew-close", ["lair.js", "document.addEventListener('keydown', e => { if (e.key === 'Escape' && L.sheet)"]);
claim("search-enter", ["real.js", "document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target && e.target.id === 'rd-sq')"]);
claim("switch", ["real.js", "document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ')"]);
claim("skill-close", ["skills.js", "document.addEventListener('keydown', e => { if (e.key === 'Escape'"]);
claim("tools-close", ["hubs.js", "document.addEventListener('keydown', e => { if (e.key === 'Escape')"]);
claim("hall", ["hof3d.js", "if (e.key === 'Escape') { e.preventDefault(); closeLegend();", "if (e.key === 'Tab') {"], ["hof3d.js", "document.addEventListener('keydown', onKey, true);"]);
claim("hall-move", ["hof3d.js", "document.addEventListener('keydown', (e) => {\n    const a = e.target.closest && e.target.closest('.hof-spot');", "all[Math.max(0, Math.min(all.length - 1, to))].focus();"]);
claim("hall", ["hofrelief.js", "if (e.key === 'Escape') { e.preventDefault(); closeLegend(); spot.focus(); }", "if (e.key === 'Tab') {"], ["hofrelief.js", "document.addEventListener('keydown', onKey, true);"]);
claim("tour", ["tour.js", "if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }", "else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }"], ["tour.js", "document.addEventListener('keydown', keys, true)"]);
claim("hud", ["hud.js", "$q('#hud-in').addEventListener('keydown'", "!e.shiftKey)"], ["hud.js", "document.addEventListener('keydown', e => { if (e.key === 'Escape') go('close')"]);
claim("palette-trap", ["a11y.js", "addEventListener('keydown', acting(true), true)"], ["a11y.js", "document.addEventListener('keydown', e => {\n    if (e.key !== 'Tab') return;", "first.focus(); }\n  }, true);"]);
claim("voice-mode", ["bridge.js", "e.altKey && !e.ctrlKey && String(e.key).toLowerCase() === 'v')"]);
claim("workspace", ["index.html", "const n = parseInt(e.key, 10);\n    if (n >= 1 && n <= WSN.length)"]);
// how many key reads each file has: a snippet can cover a whole handler, so a binding added inside one changes the count
const COUNT: Record<string, number> = {
  "a11y.js": 4, "bridge.js": 19, "datepick.js": 12, "dialogs.js": 1, "dock.js": 20, "graph.js": 6, "hof3d.js": 7, "hofrelief.js": 5, "hubs.js": 3, "hud.js": 6, "index.html": 47, "lair.js": 3, "library.js": 19, "live.js": 3, "mail.js": 3, "media.js": 7, "og.js": 5,
  "notes.js": 7, "ns.js": 2, "pg-schedule.js": 2, "real.js": 7, "shortcuts.js": 4, "skills.js": 3, "tour.js": 9,
};
// the prototype's fake terminal (#tf): bridge.js replaces termHtml with the real shell, so the form never exists
const UNREACHABLE: Claim[] = [["index.html", "ti.addEventListener('keydown'", "else if(e.key==='Escape'){ S.term=false; render(); }"]];

const files = readdirSync(ATRIUM).filter((f) => /\.(js|html)$/.test(f));
const src = new Map(files.map((f) => [f, readFileSync(join(ATRIUM, f), "utf8")]));
const catalogue: [string, [string, string, string][]][] = (() => {
  const w: any = {};
  new Function("window", "document", src.get("shortcuts.js")!)(w, undefined);
  return w.xKeys.list;
})();

function span([file, from, to]: Claim): [number, number] {
  const s = src.get(file) ?? "";
  const a = s.indexOf(from);
  if (a < 0) throw new Error(`${file}: binding gone or changed: ${from}`);
  if (s.indexOf(from, a + 1) >= 0) throw new Error(`${file}: snippet is not unique: ${from}`);
  if (!to) return [a, a + from.length];
  const b = s.indexOf(to, a);
  if (b < 0) throw new Error(`${file}: binding gone or changed: ${to}`);
  return [a, b + to.length];
}

function unclaimed(file: string, text: string, spans: [number, number][]): string[] {
  return READS.flatMap((re) => [...text.matchAll(re)])
    .filter((m) => !spans.some(([a, b]) => m.index >= a && m.index + m[0].length <= b))
    .map((m) => `${file}:${text.slice(0, m.index).split("\n").length}: ${text.slice(m.index, m.index + 60).split("\n")[0]}`);
}

describe("keyboard shortcut sheet", () => {
  const ids = catalogue.flatMap(([, rows]) => rows.map((r) => r[0]));

  test("every catalogue row is backed by code, and every claim has a row", () => {
    expect(new Set(ids).size).toBe(ids.length);
    expect(Object.keys(BOUND).sort()).toEqual([...ids].sort());
    for (const c of [...Object.values(BOUND).flat(), ...UNREACHABLE]) expect(() => span(c)).not.toThrow();
  });

  test("no key handling in the sources is missing from the catalogue", () => {
    const all = [...Object.values(BOUND).flat(), ...UNREACHABLE];
    const missing = files.flatMap((f) => unclaimed(f, src.get(f)!, all.filter((c) => c[0] === f).map(span)));
    expect(missing).toEqual([]);
  });

  test("no file gained or lost a key read inside a claimed handler", () => {
    const found = Object.fromEntries(files.map((f) => [f, unclaimed(f, src.get(f)!, []).length]).filter(([, n]) => n));
    expect(found).toEqual(COUNT);
  });

  test("the scan catches a new binding in each form", () => {
    for (const code of ["addEventListener('keydown', go)", "el.onkeyup = go", "if (e.key === 'q') go()", "if (ev.code === 'KeyQ') go()", "if (k === 'Delete') go()", "case 'Home':"])
      expect(unclaimed("new.js", code, []).length).toBeGreaterThan(0);
  });

  test("the sheet is loaded, cached offline and has a visible control", () => {
    expect(src.get("index.html")).toContain('<script src="shortcuts.js"></script>');
    expect(src.get("sw.js")).toContain('"/shortcuts.js"');
    expect(src.get("settings.js")).toContain("data-keys-open");
  });
});
