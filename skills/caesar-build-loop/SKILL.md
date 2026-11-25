---
name: caesar-build-loop
description: "Use for any CaesarOS build task from start to finish: plan the step, build it, verify in a browser, commit with explicit paths, report. The loop that keeps work moving and honest. Also: 'jak budowac', 'workflow', 'plan krok po kroku'."
---

# The build loop

1. **Read the plan** (`docs/plan/ATRIUM-PORT-PLAN-2026-11-22.md`) and take the next step you own. Do not widen it. If you find a bigger problem, add it to the plan as a new step.
2. **Say what "done" is** before writing code: the check from the plan row (a function you can run, not a file that exists).
3. **Build small**, in the files the skills name (`caesar-atrium-build`). No invented data. Our icons and controls only.
4. **Verify** with `caesar-atrium-verify` on your own port. Fix what breaks. A step that fails its check is not done.
5. **Test and gate**: `bunx tsc --noEmit -p .`, `bun test tests` (all green), `bun tools/leak-check.ts` (clean).
6. **Commit** only the files you changed, by explicit path, on a `shell/*` or `fix/*` branch, never `main`. One step, one commit, a message that says what changed and why. Push.
7. **Record**: set the plan row's status, add a line to `docs/STATE.md` with what you changed, where, how you tested it, and what is still missing. Say plainly what you did not verify.
8. **Hand over** when a limit hits: the plan and `docs/STATE.md` are the hand-over. The next worker (the other Claude, or a Hermes crew member such as Vitruvius) starts from them, not from chat.

## Never without the owner's yes
Posting or sending anything to people, deploying, restarting his running core, creating or pushing a repo, merging his data, installing outside skills, a client update.
