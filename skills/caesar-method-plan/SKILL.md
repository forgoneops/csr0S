---
name: caesar-method-plan
description: "Use when a spec or request needs several steps, before touching code: write a plan an engineer with no context could follow, step by step, each step with a check that can be run."
---

# Plan before code


Write for a capable engineer who has not seen this code or this conversation.

- **Scope first.** Independent subsystems get separate plans; each plan ends in something that works and can be tested on its own.
- **Map the files** before the steps: which files change, what each one is responsible for. Follow the structure that exists; split a file only if the work forces it.
- **Right-size the tasks.** A task is the smallest piece with its own test cycle and worth its own review. Fold setup, config and docs into the task that needs them. Split only where a reviewer could reject one task and accept the next.
- **One action per step, each with a checkable result:** write the failing test; run it and see it fail; write the least code that passes; run the tests; commit.
- **Header:** goal in one sentence, how it fits (2-3 sentences), the spec it implements, the project-wide constraints copied word for word.
- **Review focus:** list the five inputs or conditions the spec implies but no task tests, most likely to bite a real person first (empty data, a huge value, no network, a second tab, a phone). Add the test that pins each one to the task that owns the code.
- **Name exact paths, commands and expected output.** No "handle errors" or "add tests" without saying which.

In CaesarOS the plan row in the shell plan is the plan; add the steps under it and set the status as you go.
