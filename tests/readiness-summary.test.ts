import { expect, test } from "bun:test";
import { parseTestSummary } from "../tools/readiness-summary";

// A real tail of `bun test tests` in this repo. The readiness table used to print the line in the middle:
// a test description with "26 pass" inside it matched the old /\d+ pass/ selector and was reported as the count.
const WITH_TRAP = [
  "tests/readiness-score.test.ts:",
  "(pass) every check passing scores 100 and is ready [0.20ms]",
  "(pass) 26 passing and 7 skipped scores 78.8, not ready: a skip is a must-pass line that did not run [0.09ms]",
  "(pass) one failing check lowers the score below the same run with a pass, and readiness fails [0.06ms]",
  "",
  " 536 pass",
  " 0 fail",
  " 5463 expect() calls",
  "Ran 536 tests across 101 files. [14.14s]",
  "",
].join("\n");

test("the summary is Bun's own count, never a test description that contains 'N pass'", () => {
  // The old selector, kept in the test so the false match stays visible if anyone reintroduces it.
  const oldSelector = WITH_TRAP.split("\n").find((l) => /\d+ pass/.test(l));
  expect(oldSelector).toContain("26 passing and 7 skipped");

  const s = parseTestSummary(WITH_TRAP);
  expect(s).not.toBeNull();
  expect(s!.passed).toBe(536);
  expect(s!.failed).toBe(0);
  expect(s!.tests).toBe(536);
  expect(s!.files).toBe(101);
  expect(s!.line).toContain("536 pass, 0 fail");
  expect(s!.line).not.toContain("26 passing");
});

test("skip, todo and fail counts are read from their own bare count lines", () => {
  const out = [
    "(fail) fails one [0.15ms]",
    "",
    " 1 pass",
    " 1 skip",
    " 1 todo",
    " 1 fail",
    " 2 expect() calls",
    "Ran 4 tests across 1 file. [4.00ms]",
  ].join("\n");
  const s = parseTestSummary(out)!;
  expect([s.passed, s.skipped, s.todo, s.failed]).toEqual([1, 1, 1, 1]);
  expect(s.tests).toBe(4);
  expect(s.files).toBe(1);
  expect(s.line).toBe("1 pass, 1 fail, 1 skip, 1 todo · Ran 4 tests across 1 file. [4.00ms]");
});

test("the singular form Bun prints for one test and one file is recognised", () => {
  // Verbatim tail of a real run where a test could not start.
  const s = parseTestSummary(" 0 pass\n 1 fail\n 1 error\nRan 1 test across 1 file. [3.00ms]");
  expect(s).not.toBeNull();
  expect(s!.tests).toBe(1);
  expect(s!.files).toBe(1);
  expect(s!.failed).toBe(1);
  expect(s!.errors).toBe(1);
  expect(s!.line).toBe("0 pass, 1 fail, 1 error · Ran 1 test across 1 file. [3.00ms]");
});

test("a colourised summary from a terminal is read the same way", () => {
  const out = [
    "\u001b[32m 12 pass\u001b[0m",
    "\u001b[90m 2 skip\u001b[0m",
    "\u001b[32m 0 fail\u001b[0m",
    "\u001b[90mRan 14 tests across 3 files.\u001b[0m \u001b[90m[0.90s]\u001b[0m",
  ].join("\n");
  const s = parseTestSummary(out)!;
  expect(s.passed).toBe(12);
  expect(s.skipped).toBe(2);
  expect(s.tests).toBe(14);
});

test("a test that prints a count of its own does not win over Bun's closing summary", () => {
  const out = [
    "tests/logging.test.ts:",
    "(pass) a tool that prints a summary [12.00ms]",
    " 5 pass",
    " 0 fail",
    "",
    " 536 pass",
    " 0 fail",
    "Ran 536 tests across 101 files. [14.14s]",
  ].join("\n");
  const s = parseTestSummary(out)!;
  expect(s.passed).toBe(536);
});

test("no summary means null: a bare listing, a crash, and empty output cannot pass as a count", () => {
  expect(parseTestSummary("")).toBeNull();
  expect(parseTestSummary("(pass) 26 passing and 7 skipped scores 78.8 [0.09ms]")).toBeNull();
  expect(parseTestSummary(" 26 pass\n 7 skip")).toBeNull();
  expect(parseTestSummary("error: test() expects a number\n\n 0 pass\n 0 fail")).toBeNull();
});
