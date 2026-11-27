import { describe, expect, test } from "bun:test";
import { parseScheduleList } from "../core/scheduling-model";

describe("scheduling list contract", () => {
  test("parses an empty Hermes schedule", () => {
    expect(parseScheduleList("No scheduled jobs.\nCreate one with hermes cron create")).toEqual([]);
  });
  test("parses multiple jobs and preserves identifiers and schedule text", () => {
    expect(parseScheduleList("Scheduled jobs\n\nabc-1 [paused]\n  Name: Daily review\n  Schedule: 0 9 * * *\n  Next run: 2026-11-27T09:00:00\nxyz [active]\n  Name: Check\n  Schedule: every 2 hours\n  Next run: 2026-11-26T16:00:00Z")).toEqual([
      { id: "abc-1", state: "paused", name: "Daily review", schedule: "0 9 * * *", nextRun: "2026-11-27T09:00:00" },
      { id: "xyz", state: "active", name: "Check", schedule: "every 2 hours", nextRun: "2026-11-26T16:00:00Z" },
    ]);
  });
  test("parses boxed Hermes output and strips ANSI", () => {
    expect(parseScheduleList("\u001b[32mScheduled jobs\u001b[0m\n┌──────────────┐\n│ job1 [active] │\n│   Name: Boxed │\n│   Schedule: hourly │\n│   Next run: soon │\n└──────────────┘")).toEqual([
      { id: "job1", state: "active", name: "Boxed", schedule: "hourly", nextRun: "soon" },
    ]);
  });
  test("rejects malformed output, incomplete jobs, and duplicate ids", () => {
    expect(() => parseScheduleList("not Hermes output")).toThrow();
    expect(() => parseScheduleList("Scheduled jobs\na [active]\n  Name: Missing schedule")).toThrow();
    expect(() => parseScheduleList("Scheduled jobs\na [active]\n  Name: A\n  Schedule: daily\n  Next run: later\na [active]\n  Name: B\n  Schedule: daily\n  Next run: later")).toThrow();
  });
});
