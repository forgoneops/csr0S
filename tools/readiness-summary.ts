// Reading Bun's own test summary for the readiness table, kept pure so it can be tested without a browser.
// The table must never show a test description as the count: every running test line carries a "(pass)" or
// "(fail)" prefix and may contain any number ("26 passing and 7 skipped scores 78.8"), so only a bare
// count line (" 536 pass") followed by Bun's closing "Ran N tests across M files." line is the summary.

const ANSI = /\x1b\[[0-9;]*m/g;
const COUNT = /^(\d+)\s+(pass|fail|skip|todo|error)$/;
const RAN = /^Ran\s+(\d+)\s+tests?\s+across\s+(\d+)\s+files?\.(?:\s+\[[^\]]*\])?$/;
const EXPECT_CALLS = /^\d+\s+expect\(\) calls$/;

export type TestSuiteSummary = {
  passed: number;
  failed: number;
  skipped: number;
  todo: number;
  /** Tests that could not even be started (Bun's "N error" line); Bun does not count these as tests. */
  errors: number;
  /** Bun's own count, from its "Ran N tests across M files." line. */
  tests: number;
  files: number;
  /** What the readiness table shows: the anchored counts plus Bun's closing line. */
  line: string;
};

/**
 * The real summary block at the end of `bun test` output, or null when there is none.
 * Bun prints its summary last, so the last bare "N pass" line is the one that counts; a count line
 * printed by a test earlier in the run is never taken.
 */
export function parseTestSummary(out: string): TestSuiteSummary | null {
  const lines = out.replace(ANSI, "").split("\n").map((l) => l.trim());
  let start = -1;
  for (let i = lines.length - 1; i >= 0; i--) if (/^\d+\s+pass$/.test(lines[i])) { start = i; break; }
  if (start === -1) return null;

  const counts = { passed: 0, failed: 0, skipped: 0, todo: 0, errors: 0 };
  let ran: RegExpExecArray | null = null;
  let ranLine = "";
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    const count = COUNT.exec(line);
    if (count) {
      const n = Number(count[1]);
      if (count[2] === "pass") counts.passed = n;
      else if (count[2] === "fail") counts.failed = n;
      else if (count[2] === "skip") counts.skipped = n;
      else if (count[2] === "todo") counts.todo = n;
      else counts.errors = n;
      continue;
    }
    if (EXPECT_CALLS.test(line) || line === "") continue;
    ran = RAN.exec(line);
    ranLine = line;
    break; // any other line ends the block: this was not Bun's summary
  }
  if (!ran) return null;

  const parts = [`${counts.passed} pass`, `${counts.failed} fail`];
  if (counts.skipped) parts.push(`${counts.skipped} skip`);
  if (counts.todo) parts.push(`${counts.todo} todo`);
  if (counts.errors) parts.push(`${counts.errors} error`);
  return {
    ...counts,
    tests: Number(ran[1]),
    files: Number(ran[2]),
    line: `${parts.join(", ")} · ${ranLine}`,
  };
}
