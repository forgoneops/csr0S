// FIX-seg-targets: a segmented button is a touch target (R24), so its rule must carry a real
// min-height of at least 44 px. The check reads web/src/base.css, resolves the token the rule uses
// and fails when the value is missing, unresolvable or smaller than 44 px.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const CSS = readFileSync(join(ROOT, "web", "src", "base.css"), "utf8");
const TARGET_MIN = 44;

/** The declaration block of one exact selector, anchored at the start of a line so `.seg-btn:hover`
 *  and `.term-seg .seg-btn` never match. */
function block(selector: string): string | null {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?:^|\\n)${escaped}\\{([^}]*)\\}`, "m").exec(CSS);
  return match ? match[1] : null;
}

function declarations(css: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of css.split(";")) {
    const i = part.indexOf(":");
    if (i < 0) continue;
    out.set(part.slice(0, i).trim(), part.slice(i + 1).trim());
  }
  return out;
}

/** `var(--target)` -> the value of `--target` in the token block, so the test measures pixels, not names. */
function resolve(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const varName = /^var\(\s*(--[a-z0-9-]+)\s*(?:,\s*([^)]+))?\)$/i.exec(value.trim());
  if (!varName) return value.trim();
  const token = new RegExp(`${varName[1]}\\s*:\\s*([^;]+);`).exec(CSS);
  return token ? token[1].trim() : varName[2]?.trim();
}

function px(value: string | undefined): number | null {
  if (!value) return null;
  const match = /^(\d+(?:\.\d+)?)px$/.exec(value);
  return match ? Number(match[1]) : null;
}

describe("segmented buttons are touch targets", () => {
  test("the .seg-btn rule exists and is the bare selector", () => {
    expect(block(".seg-btn")).not.toBeNull();
  });

  test(".seg-btn declares a min-height of at least 44 px", () => {
    const decls = declarations(block(".seg-btn") ?? "");
    const value = resolve(decls.get("min-height"));
    expect(value).toBeDefined();
    const height = px(value);
    expect(height).not.toBeNull();
    expect(height as number).toBeGreaterThanOrEqual(TARGET_MIN);
  });

  test(".seg-btn does not pin a height below 44 px", () => {
    const decls = declarations(block(".seg-btn") ?? "");
    const value = resolve(decls.get("height"));
    if (value === undefined) return; // no fixed height: the min-height governs
    const height = px(value);
    expect(height).not.toBeNull();
    expect(height as number).toBeGreaterThanOrEqual(TARGET_MIN);
  });
});
