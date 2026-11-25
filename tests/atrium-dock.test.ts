// Plan 8.10/8.10a, the chat dock: the page loads it after a11y.js, the worker precaches it, and it
// speaks through the bridge's one streamed turn (window.xTurn) instead of copying the SSE reader.
// Its styles are a scoped module; the CSS-scope test owns the selector rules.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ATRIUM = join(import.meta.dir, "..", "web", "atrium");
const html = readFileSync(join(ATRIUM, "index.html"), "utf8");
const sw = readFileSync(join(ATRIUM, "sw.js"), "utf8");
const dock = readFileSync(join(ATRIUM, "dock.js"), "utf8");
const css = readFileSync(join(ATRIUM, "dock.css"), "utf8");

const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);

describe("chat dock", () => {
  test("loads last in the page, after a11y.js, and both files are precached", () => {
    expect(scripts.indexOf("dock.js")).toBeGreaterThan(scripts.indexOf("a11y.js"));   // other modules (the Board) may load between them
    expect(sw).toContain('"/dock.js"');
    expect(sw).toContain('"/dock.css"');
  });

  test("registers as its own module and remembers the conversation under caesar.dock.v1", () => {
    expect(dock).toContain("register({ id: 'dock'");
    expect(dock).toContain("caesar.dock.v1");
    expect(dock).toContain("hermes:caesar!alone");
  });

  test("sends through the bridge's runTurn, not a second SSE reader", () => {
    expect(dock).toContain("window.xTurn");
    expect(dock).not.toContain("getReader");
    expect(dock).not.toContain("TextDecoder");
  });

  test("styles live under the .cdk root only", () => {
    expect(css).toContain(".cdk {");
    expect(css).toContain(".cdk .cdk-win");
    expect(css).not.toMatch(/\n\s*(html|body|button|input|textarea|section|header|div)\b/);
  });
});
