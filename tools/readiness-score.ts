// Scoring for the readiness pass, kept pure so it can be tested without a browser or a running core.
// The 98 percent rule (docs/plan/ATRIUM-PORT-PLAN-2026-11-22.md): the percentage is passed checks over
// ALL checks. A skipped check is a must-pass gate line that did not run, so it counts as not passed.
// Only the polish list may stay open, and polish lines are not readiness checks.

export type ReadinessState = "pass" | "fail" | "skip";

export const READY_AT = 98;

export type ReadinessScore = {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  /** passed / total as 0..100, unrounded; 0 when there is nothing to score. */
  pct: number;
  threshold: number;
  /** true only at or above the threshold and when every must-pass check passed. */
  ready: boolean;
};

export function scoreReadiness(
  checks: readonly { state: ReadinessState }[],
  threshold = READY_AT,
): ReadinessScore {
  const total = checks.length;
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  for (const c of checks) {
    if (c.state === "pass") passed++;
    else if (c.state === "skip") skipped++;
    else failed++;
  }
  const pct = total ? (100 * passed) / total : 0;
  return { total, passed, failed, skipped, pct, threshold, ready: pct >= threshold && failed === 0 && skipped === 0 };
}
