// Plan 9.2, CSS scope: every module's styles live under that module's own root, so a rule in one
// module can never reach into another module's markup or the base.
//
// What is a base file and what is a module (read from web/atrium/*.css, 2026-11-23):
//   base (exempt from both rules):
//     kit.css    the shared kit on top of the prototype: its controls (.kit-ico, .pk-* picker,
//                .xf-* reply folds, .nx-att-* attachments, .ph-* phone list, .rt-* terminal, the
//                composer menu) and, until they get files of their own, the settings (.st-*),
//                notes (.nt-*), computer (.cx-*), setup (.su-*) and hub (.hub-*) blocks.
//     og.css     the prototype mockup's own classes (og-*).
//     ns.css     the prototype shell and left menu.
//     real.css   the compiled prototype/React base bundle.
//   module (rules below apply):
//     neo.css            root html[data-skin=neo]
//     theme-neutral.css  root html[data-skin=neo][data-theme=neutral]
//   reserved names (same rules the day the file exists): settings.css .settings, notes.css .nt,
//     computer.css .cx, setup.css .su, hubs.css .hub.
//
// A module stylesheet may only write selectors whose leftmost part is its own root (themes use the
// html attribute as that root); an unscoped class rule is, by definition, a rule targeting a class
// owned by another module or by the base. Outside the base files no rule may be a bare element
// selector (body, html, h1, button, input, a, ...), which would apply to the whole page.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ATRIUM = join(import.meta.dir, "..", "web", "atrium");

const BASE: Record<string, string> = {
  "kit.css": "the shared kit on top of the prototype",
  "og.css": "the prototype mockup's own classes",
  "ns.css": "the prototype shell and left menu",
  "real.css": "the compiled prototype/React base bundle",
};

const MODULES: Record<string, string> = {
  "neo.css": "html[data-skin=neo]",
  "theme-neutral.css": "html[data-skin=neo][data-theme=neutral]",
  "theme-pack.css": "html[data-skin=neo][data-tpack]",
  "board.css": ".bd",
  "media.css": ".md",
  "dock.css": ".cdk",
  "live.css": ".lv",
  "goals.css": ".goals-view",
  "toolgraph.css": ".toolgraph-view",
  "finance.css": ".finance-view",
  "hof3d.css": ".hf3",
  "skills.css": ".sk",
  "pg-market.css": ".pgm",
  "pg.css": ".pg",
  "library.css": ".lx-",
  "pg-sys.css": ".ps",
  "studio.css": ".sdx",
  "getstarted.css": ".gsx",
  "lair.css": ".lr",
  "gaps.css": ".gx",
};

// names a module stylesheet takes once its rules leave kit.css
const RESERVED = ["settings.css", "notes.css", "computer.css", "setup.css", "hubs.css"];

/** Rules of a stylesheet: at-rule blocks are walked into, keyframes skipped, comments blanked
 *  without losing line numbers. */
function rules(css: string): { selector: string; line: number }[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  const found: { selector: string; line: number }[] = [];
  const lineOf = (pos: number) => text.slice(0, pos).split("\n").length;

  const walk = (from: number, to: number, inKeyframes: boolean) => {
    let i = from;
    let preludeStart = from;
    while (i < to) {
      const c = text[i];
      if (c === '"' || c === "'") {
        const end = text.indexOf(c, i + 1);
        i = end < 0 || end >= to ? to : end + 1;
        continue;
      }
      if (c === "{") {
        const prelude = text.slice(preludeStart, i).trim();
        let depth = 1;
        let close = i + 1;
        while (close < to && depth > 0) {
          if (text[close] === "{") depth++;
          else if (text[close] === "}") depth--;
          close++;
        }
        const bodyEnd = close - 1;
        if (prelude.startsWith("@")) {
          const keyframes = /^@(?:-\w+-)?keyframes/i.test(prelude);
          walk(i + 1, bodyEnd, inKeyframes || keyframes);
        } else if (prelude && !inKeyframes) {
          found.push({ selector: prelude, line: lineOf(preludeStart) });
        }
        i = close;
        preludeStart = i;
        continue;
      }
      if (c === ";" || c === "}") preludeStart = i + 1;
      i++;
    }
  };

  walk(0, text.length, false);
  return found;
}

/** Selectors of one rule prelude, split on top-level commas only. */
function selectors(prelude: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const c of prelude) {
    if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    if (c === "," && depth === 0) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out.map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
}

/** The leftmost compound of a selector: everything before the first top-level combinator. */
function firstCompound(selector: string): string {
  let depth = 0;
  for (let i = 0; i < selector.length; i++) {
    const c = selector[i];
    if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (depth === 0 && (c === " " || c === ">" || c === "+" || c === "~")) return selector.slice(0, i);
  }
  return selector;
}

/** A bare element rule: a type selector with no class, id or attribute of its own, so it applies
 *  to every such element on the page (`button`, `a:hover`, `h1`). */
function isElementRule(selector: string): boolean {
  const compound = firstCompound(selector).replace(/::?[\w-]+(\([^()]*\))?/g, "");
  return /^[a-zA-Z][a-zA-Z0-9-]*$/.test(compound);
}

const files = readdirSync(ATRIUM).filter((f) => f.endsWith(".css")).sort();
const moduleFiles = files.filter((f) => f in MODULES);

type Violation = { file: string; line: number; selector: string };

const unscoped: Violation[] = [];
const elements: Violation[] = [];
const unmapped: string[] = [];

for (const file of files) {
  const isBase = file in BASE || RESERVED.includes(file);
  if (!isBase && !(file in MODULES)) unmapped.push(file);
  const css = readFileSync(join(ATRIUM, file), "utf8");
  for (const rule of rules(css)) {
    for (const selector of selectors(rule.selector)) {
      if (!isBase && isElementRule(selector)) elements.push({ file, line: rule.line, selector });
      const root = MODULES[file];
      if (root && !firstCompound(selector).startsWith(root)) unscoped.push({ file, line: rule.line, selector });
    }
  }
}

const brief = (list: Violation[]) => list.slice(0, 12).map((v) => `${v.file}:${v.line} ${v.selector}`).join("\n");

describe("Atrium CSS scope: every module is scoped to its own root", () => {
  test("every stylesheet in web/atrium is either base or a declared module", () => {
    expect({ unmapped }).toEqual({ unmapped: [] });
  });

  test("no module rule targets an element selector or an unscoped class (ours or the base's)", () => {
    expect(moduleFiles.length).toBeGreaterThan(0);
    expect(brief(unscoped)).toBe("");
    expect(unscoped.length).toBe(0);
  });

  test("no bare global element rule outside the base files", () => {
    expect(brief(elements)).toBe("");
    expect(elements.length).toBe(0);
  });
});
