// The second half of the catalog drift test: the source reader in ui-catalog-drift.test.ts cannot see text built at run time or
// in files nobody listed, so this one reads the screen. A real browser picks Polish at the language gate and walks every page
// (optional modules off and on), sub-tabs, Settings cards, chat, dock, palette, bell, the Hall of Fame card and the core-down
// states (tests/helpers/pl-walk.ts). Any text that is not Polish fails, and so does any of the person's own words in the
// translation queue. Allowed English lives in IGNORE there. Skipped without playwright-core or Chromium, or with CAESAROS_SKIP_HEAVY.
//
// What it CANNOT see:
//  - a surface the walk never opens: dialogs behind a destructive or networked button, voice and upload errors other than the
//    one it triggers, states that need real data (mail, devices, leads, fleet, missions), pop-out windows, the HUD;
//  - anything under data-no-i18n or the translator's own skip list (a script that marks interface text that way hides it),
//    except the Hall of Fame card; the tour has its own two languages and its own test;
//  - text drawn on a canvas, CSS content, system notifications and spoken text;
//  - a half-translated sentence that has Polish letters and no common English word ("Zapisano file");
//  - wrong or clumsy Polish, and the 120 ms of English between a redraw and the translator;
//  - the phone layout (run: bun tests/helpers/pl-walk.ts --phone).
// PLWALK_ONLY=Board,Chat narrows the pages while hunting.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CHROME, judge, LIB, walkPolish } from "./helpers/pl-walk";

const catalog = JSON.parse(readFileSync(join(import.meta.dir, "..", "web", "atrium", "locales", "pl.json"), "utf8")) as Record<string, string>;

test("the judge passes Polish and kept names, and fails hardcoded English", () => {
  const ok = judge(catalog);
  for (const s of ["Ustawienia", "CaesarOS", "Wydarzenia: 3", "llama3.2:1b · 1.3 GB"]) expect([s, ok(s)]).toEqual([s, true]);
  for (const s of ["A planted line nobody translated", "3 files are waiting", "Zapisano the file", "Nobody translated this. ".repeat(14)]) expect([s, ok(s)]).toEqual([s, false]);
});

const canRun = !!LIB && !!CHROME && !process.env.CAESAROS_SKIP_HEAVY;
if (!canRun) console.warn("ui-rendered-pl: no playwright-core or Chromium here (or CAESAROS_SKIP_HEAVY), the rendered Polish walk is skipped");

describe.skipIf(!canRun)("the rendered shell in Polish", () => {
  test("no page shows English, and none of the person's words reach the translation queue", async () => {
    const only = process.env.PLWALK_ONLY?.split(",");
    const r = await walkPolish({ only });
    expect([...r.found].map(([text, f]) => `${text}  [${[...f.surfaces][0]}, ${f.at}]`)).toEqual([]);
    expect(r.leaked).toEqual([]);
    expect(r.errors).toEqual([]);
    if (!only) { expect(r.pages).toBeGreaterThan(60); expect(r.strings).toBeGreaterThan(900); }
  }, 900_000);
});
