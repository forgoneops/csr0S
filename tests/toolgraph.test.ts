import { describe, expect, test } from "bun:test";
import { summarize, type ToolRun } from "../core/modules/toolgraph/model";

const runs: ToolRun[] = [
  { id: "r1", agent: "Scout", status: "done", startedAt: 1, steps: [
    { id: "1", kind: "tool", label: "search", status: "done", elapsedMs: 80 },
    { id: "2", kind: "tool", label: "fetch", status: "failed", elapsedMs: 120 },
  ] },
  { id: "r2", agent: "Builder", status: "running", startedAt: 2, steps: [
    { id: "3", kind: "read", label: "search", status: "running" },
    { id: "4", kind: "delta", label: "ignored", status: "done", elapsedMs: 500 },
  ] },
];

describe("Toolgraph summaries", () => {
  test("aggregates calls, latency and errors per tool, excluding non-call events", () => {
    expect(summarize(runs)).toEqual({
      tools: [
        { tool: "fetch", calls: 1, errors: 1, totalMs: 120, averageMs: 120 },
        { tool: "search", calls: 2, errors: 0, totalMs: 80, averageMs: 80 },
      ],
      hottestPath: { agent: "Scout", status: "done", calls: 2, totalMs: 200, chain: ["search", "fetch"] },
      totals: { calls: 3, errors: 1, runs: 2 },
    });
  });
  test("handles missing timing, empty labels and empty histories", () => {
    expect(summarize([{ id: "empty", agent: "", status: "done", startedAt: 0, steps: [{ id: "x", kind: "command", label: " ", status: "running" }] }])).toMatchObject({ tools: [{ tool: "command", calls: 1, totalMs: 0, averageMs: null }], totals: { calls: 1, errors: 0 }, hottestPath: { chain: ["command"] } });
    expect(summarize([])).toEqual({ tools: [], hottestPath: null, totals: { calls: 0, errors: 0, runs: 0 } });
  });
  test("ignores negative and non-finite durations", () => {
    const result = summarize([{ id: "r", agent: "", status: "done", startedAt: 0, steps: [
      { id: "a", kind: "tool", label: "x", status: "done", elapsedMs: -4 },
      { id: "b", kind: "tool", label: "x", status: "done", elapsedMs: Number.NaN },
    ] }]);
    expect(result.tools[0]).toMatchObject({ calls: 2, totalMs: 0, averageMs: null });
  });
});
