import { expect, test } from "bun:test";
import { READY_AT, scoreReadiness, type ReadinessState } from "../tools/readiness-score";

const states = (pass: number, skip = 0, fail = 0) => [
  ...Array.from({ length: pass }, () => ({ state: "pass" as ReadinessState })),
  ...Array.from({ length: skip }, () => ({ state: "skip" as ReadinessState })),
  ...Array.from({ length: fail }, () => ({ state: "fail" as ReadinessState })),
];

test("every check passing scores 100 and is ready", () => {
  const s = scoreReadiness(states(33));
  expect(s.total).toBe(33);
  expect(s.skipped).toBe(0);
  expect(s.pct).toBe(100);
  expect(s.ready).toBe(true);
});

test("26 passing and 7 skipped scores 78.8, not ready: a skip is a must-pass line that did not run", () => {
  const s = scoreReadiness(states(26, 7));
  expect(s.total).toBe(33);
  expect(s.passed).toBe(26);
  expect(s.skipped).toBe(7);
  expect(s.failed).toBe(0);
  expect(s.pct.toFixed(1)).toBe("78.8");
  expect(s.ready).toBe(false);
});

test("one failing check lowers the score below the same run with a pass, and readiness fails", () => {
  const clean = scoreReadiness(states(26, 7));
  const oneFail = scoreReadiness(states(25, 7, 1));
  expect(oneFail.failed).toBe(1);
  expect(oneFail.pct).toBeLessThan(clean.pct);
  expect(oneFail.ready).toBe(false);
});

test("98 percent is necessary but any open must-pass check still blocks readiness", () => {
  const atThresholdWithSkips = scoreReadiness(states(98, 2));
  expect(atThresholdWithSkips.pct).toBe(98);
  expect(atThresholdWithSkips.ready).toBe(false);
  expect(scoreReadiness(states(97, 3)).ready).toBe(false);
  expect(scoreReadiness(states(98, 0, 2)).ready).toBe(false);
  expect(scoreReadiness(states(100)).ready).toBe(true);
  expect(READY_AT).toBe(98);
});

test("32 of 33 is below 98 percent, so one open gate blocks readiness", () => {
  const s = scoreReadiness(states(32, 1));
  expect(s.pct).toBeCloseTo(96.97, 2);
  expect(s.pct).toBeLessThan(READY_AT);
  expect(s.ready).toBe(false);
});

test("an empty pass scores 0 and is never ready", () => {
  const s = scoreReadiness([]);
  expect(s.total).toBe(0);
  expect(s.pct).toBe(0);
  expect(s.ready).toBe(false);
});
