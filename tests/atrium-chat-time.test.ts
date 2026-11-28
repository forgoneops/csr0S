// The time under every chat message: chatx.js formats it, real.css styles it. bridge.js must set `at` on each message
// and index.html must call xTime(x.at) in both nx-who rows (the two pending tests below pin that wiring).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const A = join(import.meta.dir, "..", "web", "atrium");
const read = (f: string) => readFileSync(join(A, f), "utf8");

describe("chat message time", () => {
  test("xTime formats HH:MM, adds the date after a day, and is empty without a time", () => {
    const g: any = globalThis; g.uiLocale = (en: string) => en;
    const src = read("chatx.js");
    new Function(src.slice(src.indexOf("window.xTime")).replace("window.xTime", "globalThis.xTime"))();
    expect(g.xTime(0)).toBe("");
    expect(g.xTime(Date.now())).toMatch(/<time class="nx-time" datetime="[^"]+"> · \d{1,2}:\d{2}/);
    expect(g.xTime(Date.now() - 3 * 864e5)).toMatch(/> · .+ \d{1,2}:\d{2}/);
  });
  test("styled with theme tokens, no round shape", () => {
    expect(read("real.css")).toMatch(/\.nx-time\{color:var\(--muted\);font:10px var\(--font-mono\)/);
  });
  test("bridge.js stamps every message", () => {
    const b = read("bridge.js");
    expect(b).toContain("at: m.createdAt || got.session.updatedAt");
    expect(b).toContain("reply.at = Date.now()");
  });
  test("the view draws it for user and agent messages", () => {
    expect((read("index.html").match(/xTime\(x\.at\)/g) || []).length).toBe(2);
  });
});
