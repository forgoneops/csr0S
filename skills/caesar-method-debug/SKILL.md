---
name: caesar-method-debug
description: "Use for any bug, failing test or unexpected behaviour, before proposing a fix: find the root cause first. Especially under time pressure or after a fix that did not work."
---

# Find the cause, then fix


No fix without a known root cause. A fix for a symptom is a new bug waiting.

1. **Investigate.** Read the whole error and stack trace. Reproduce it reliably; if you cannot, collect more evidence instead of guessing. Check what changed (diff, recent commits, config, environment). With several components in a chain, log what goes in and out at each boundary, run once, and see WHERE it breaks before choosing where to look.
2. **Compare.** Find similar code that works. List every difference, however small, and what each one assumes.
3. **Hypothesis.** Write one sentence: "the cause is X because Y". Test it with the smallest change, one variable at a time. Wrong? Form a new hypothesis, do not stack fixes.
4. **Fix once.** Failing test first (`caesar-method-tdd`), then one change at the cause, then run everything.
5. **Three failed fixes** means the model of the system is wrong, not that you need a fourth try. Stop, say what you learned, and question the design or ask the owner.

Warning signs you are guessing: "quick fix for now", changing several things at once, a fix without a reproduction, "it probably is".
Add a line to the Traps list in the handoff when a cause was surprising.
