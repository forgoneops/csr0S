import { test, expect } from "bun:test";
import { SETTINGS_SECTIONS, sectionOf } from "../web/src/shell/screens";
import { readFileSync } from "fs";

const i18n = readFileSync("web/src/i18n.ts", "utf8");

test("every settings section has an English and a Polish name", () => {
  for (const s of SETTINGS_SECTIONS) expect(i18n.split(`"settings.section.${s.id}"`).length - 1).toBe(2);
});

test("a section address maps to its section, anything else falls back to appearance", () => {
  expect(sectionOf("/settings/engine")).toBe("engine");
  expect(sectionOf("/settings")).toBe("appearance");
  expect(sectionOf("/settings/nope")).toBe("appearance");
});

test("every history, palette and lock string exists in both languages", () => {
  for (const k of ["history.back", "history.forward", "palette.goto", "palette.commands", "locked.reason", "locked.why", "locked.title"]) expect(i18n.split(`"${k}"`).length - 1).toBe(2);
});

test("base.css braces balance, so no rule hides inside an unclosed media query", () => {
  const css = readFileSync("web/src/base.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  expect(css.split("{").length).toBe(css.split("}").length);
});
