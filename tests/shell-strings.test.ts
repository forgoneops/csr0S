// N1: the bundled native shell page (src-tauri/ui) carries its own dictionaries and talks to the Rust
// shell. Both languages must carry the same keys, and every probe reason the Rust side can report must
// have a message on the page, in both languages, or the offline screen silently shows a raw code.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const UI = join(ROOT, "src-tauri", "ui");
const STATUS_RS = join(ROOT, "src-tauri", "logic", "src", "status.rs");

const dicts = JSON.parse(readFileSync(join(UI, "strings.json"), "utf8")) as Record<string, Record<string, string>>;
const appJs = readFileSync(join(UI, "app.js"), "utf8");

/** snake_case form of a Rust enum variant name. */
const snake = (variant: string) => variant.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();

/** Reason variants as declared in shell_logic::status (the JSON the page receives). */
function rustReasons(): string[] {
  const src = readFileSync(STATUS_RS, "utf8");
  const block = /pub enum Reason \{([\s\S]*?)\n\}/.exec(src);
  if (!block) throw new Error("could not find `pub enum Reason` in logic/src/status.rs");
  return [...block[1].matchAll(/^\s{4}([A-Z][A-Za-z0-9]*),/gm)].map((m) => snake(m[1]));
}

/** The REASONS array app.js uses to decide whether a message is a translatable reason code. */
function jsReasons(): string[] {
  const block = /var REASONS = \[([\s\S]*?)\];/.exec(appJs);
  if (!block) throw new Error("could not find `var REASONS = [...]` in src-tauri/ui/app.js");
  return [...block[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

describe("native shell strings", () => {
  test("en and pl have exactly the same keys", () => {
    expect(Object.keys(dicts.pl).sort()).toEqual(Object.keys(dicts.en).sort());
  });

  test("no value is empty in either language", () => {
    const empty = Object.entries(dicts).flatMap(([lang, table]) =>
      Object.entries(table).filter(([, v]) => !String(v).trim()).map(([k]) => `${lang}:${k}`),
    );
    expect(empty).toEqual([]);
  });

  test("both languages are non-trivial", () => {
    expect(Object.keys(dicts.en).length).toBeGreaterThan(30);
  });

  test("every reason the Rust shell can report has a message in both languages", () => {
    const reasons = rustReasons();
    expect(reasons.length).toBeGreaterThan(5);
    const missing = reasons.flatMap((r) =>
      ["en", "pl"].filter((lang) => !dicts[lang]?.[`reason.${r}`]).map((lang) => `${lang}:reason.${r}`),
    );
    expect(missing).toEqual([]);
  });

  test("app.js translates exactly the reasons the Rust shell reports", () => {
    expect(jsReasons().sort()).toEqual(rustReasons().sort());
  });

  test("every t('key') used by the page exists in both languages", () => {
    const used = new Set([...appJs.matchAll(/\bt\(\s*'([a-z0-9._]+)'/g)].map((m) => m[1]));
    // t('reason.' + reason) and t('lang-' + l) are built at run time; those prefixes are covered above.
    const keys = [...used].filter((k) => !k.endsWith("."));
    const missing = keys.flatMap((k) =>
      ["en", "pl"].filter((lang) => !dicts[lang]?.[k]).map((lang) => `${lang}:${k}`),
    );
    expect(missing).toEqual([]);
    expect(keys.length).toBeGreaterThan(20);
  });
});
