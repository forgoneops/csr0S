// The Background setting: three levels, Rich is the default, and the page, settings and palette all know it.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Settings } from "../core/schema.ts";

const A = join(import.meta.dir, "..", "web", "atrium");
const read = (f: string) => readFileSync(join(A, f), "utf8");

describe("Background setting", () => {
  test("defaults to rich, accepts subtle and off, refuses anything else", () => {
    expect(Settings.parse({}).background).toBe("rich");
    for (const v of ["rich", "subtle", "off"] as const) expect(Settings.parse({ background: v }).background).toBe(v);
    expect(Settings.safeParse({ background: "loud" } as never).success).toBe(false);
  });
  test("settings page, palette, boot default and the Polish catalog carry it", () => {
    expect(read("settings.js")).toContain('data-st="bg:${id}"');
    expect(read("index.html")).toContain("Background: Subtle");
    expect(read("index.html")).toMatch(/root\.dataset\.bg=b==='subtle'\|\|b==='off'\?b:'rich'/);
    expect(read("background.js")).toContain('"data-bg"');
    const pl = JSON.parse(read("locales/pl.json"));
    for (const k of ["Background", "Rich", "Subtle", "Background: Rich"]) expect(pl[k]).toBeTruthy();
  });
});
