import { describe, expect, test } from "bun:test";
import { parseDag } from "../core/dag";

const n = (key: string, o: Record<string, unknown> = {}) => ({ key, task: "t " + key, deliverable: "d", verify: "v", stop: "s", scope: [], after: [], ...o });
const err = (x: unknown) => { const r = parseDag(x); return "error" in r ? r.error : ""; };

describe("caesar_dag graph rules", () => {
  test("a sound plan passes", () => { expect("nodes" in parseDag([n("a", { scope: ["src"] }), n("b", { scope: ["src/x"], after: ["a"] })])).toBe(true); });
  test("cycles, unknown edges and self edges are refused", () => {
    expect(err([n("a", { after: ["b"] }), n("b", { after: ["a"] })])).toContain("cycle");
    expect(err([n("a", { after: ["zz"] })])).toContain("unknown");
    expect(err([n("a", { after: ["a"] })])).toContain("itself");
  });
  test("two writers of one path need an edge", () => {
    expect(err([n("a", { scope: ["src"] }), n("b", { scope: ["src/x.ts"] })])).toContain("no edge");
    expect(err([n("a", { scope: ["src"] }), n("b", { scope: ["docs"] })])).toBe("");
    expect(err([n("a", { scope: ["src"] }), n("m"), n("b", { scope: ["src"], after: ["m"] }), ].map((x, i) => (i === 1 ? { ...x, after: ["a"] } : x)))).toBe("");
  });
  test("limits and missing fields", () => {
    expect(err(Array.from({ length: 49 }, (_, i) => n("k" + i)))).toContain("at most 48");
    expect(err([{ ...n("a"), verify: "" }])).toContain("verify");
    expect(err([n("a"), n("a")])).toContain("twice");
    expect(err([n("a", { scope: ["../etc"] })])).toContain("outside");
    expect(err([])).toContain("at least one");
  });
});
