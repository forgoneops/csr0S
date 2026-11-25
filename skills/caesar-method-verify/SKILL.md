---
name: caesar-method-verify
description: "Use before saying that work is done, fixed or passing, and before every commit, push or handoff: run the proving command now and report what it printed. Evidence before claims."
---

# Verify before you claim


You may not say it works unless you ran the check in this turn and read the output.

1. Name the command that proves the claim.
2. Run it in full, fresh.
3. Read the output and the exit code; count the failures.
4. Say what is true, with the evidence. Then, and only then, the claim.

| Claim | Needs | Does not count |
|---|---|---|
| tests pass | the test run, 0 failures | an earlier run, "should pass" |
| types are clean | `bunx tsc --noEmit -p .` with no errors | the tests passing |
| a bug is fixed | the original symptom no longer happens | the code changed |
| a regression test works | it failed without the fix and passes with it | it passes once |
| a crew member or sub-agent finished | the diff and the tests, read by you | its "done" message |
| it looks right | you opened it in a browser and looked | the code reads fine |
| nothing leaks | `bun tools/leak-check.ts` output | no secrets were added on purpose |

Stop when you catch yourself writing "should", "probably", "seems to" or "great, done" before a check, or when you are tired and want it over. Say what you did not check, plainly, at the end of the report.
