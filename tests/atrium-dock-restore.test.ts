// The chat dock's restored behaviour: unread, size meter, snapping launcher, resize reset, tab strip. Source-level checks
// (the dock needs a browser); the pure rules are re-run here on copies of the same formulas.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ATRIUM = join(import.meta.dir, "..", "web", "atrium");
const dock = readFileSync(join(ATRIUM, "dock.js"), "utf8");
const css = readFileSync(join(ATRIUM, "dock.css"), "utf8");

describe("dock: unread", () => {
  test("counts replies against what was seen, and viewing clears", () => {
    expect(dock).toContain("const unreadOf");
    expect(dock).toContain("D.seen[id] = n");
    expect(dock).toContain("pageShows(id)");   // the chat page open on that conversation counts as reading it
    expect(dock).toContain("cdk-un");           // count on the tab
    expect(dock).toContain("launchImg.src = uc ? uc.img");   // launcher wears the agent's face
    expect(css).toContain(".cdk.cdk-dupe:not(.cdk-has-un) .cdk-launch");
  });
  test("history that is still loading is not news", () => {
    expect(dock).toContain("if (!D.ready.has(id)) continue");
  });
});

describe("dock: meter", () => {
  test("reads the context size and the plan usage, shown as text and a bar", () => {
    expect(dock).toContain("/context?model=");
    expect(dock).toContain("/api/usage/limits");
    expect(dock).toContain("cdk-mt-bar");
    expect(css).not.toMatch(/\.cdk-mt[^{]*:hover/);   // never hover-only
  });
});

describe("dock: launcher and window", () => {
  test("snap picks the nearer side and stays on screen", () => {
    const LS = 52, EDGE = 16, W = 1000;
    const snap = (r: number) => (r + LS / 2 > W / 2 ? W - LS - EDGE : EDGE);
    expect(snap(700)).toBe(W - LS - EDGE);   // launcher near the left edge goes left
    expect(snap(100)).toBe(EDGE);
    expect(dock).toContain("D.r + LS / 2 > innerWidth / 2 ? innerWidth - LS - EDGE : EDGE");
    expect(dock).toContain("snap(); h.dataset.moved");
  });
  test("Shift+arrows move the launcher, Home resets the size", () => {
    expect(dock).toContain("if (!e.shiftKey || !d) return");
    expect(dock).toContain("k === 'Home'");
    expect(dock).toContain("D.w = DW; D.h = DH");
    expect(dock).toContain("innerWidth * 0.9");   // size clamped to the viewport
    expect(css).toContain("max-width:760px");   // phone keeps the full-width sheet
  });
});

describe("dock: tabs", () => {
  test("wheel scrolls the strip sideways", () => {
    expect(dock).toContain("strip.scrollLeft += e.deltaY");
  });
  test("each tab keeps its thread and draft; closing the front one shows the next; none left closes the window", () => {
    expect(dock).toContain("D.drafts[D.id || '']");
    expect(dock).toContain("D.tabs[i] || D.tabs[i - 1] || null");
    expect(dock).toContain("if (!D.tabs.length && !D.id) { close2(); return; }");
    expect(dock).toContain("tabs: D.tabs");   // remembered
    expect(dock).toContain("D.busyIds");      // a turn keeps its own thread when you switch
  });
  test("tab controls are real buttons with names, 44px on a phone", () => {
    expect(dock).toContain('data-dk="tgo"');
    expect(dock).toContain('aria-label="Close ');
    expect(css).toMatch(/\.cdk \.cdk-tabb, \.cdk \.cdk-tabx, \.cdk \.cdk-tabn \{ height:44px/);
  });
});
