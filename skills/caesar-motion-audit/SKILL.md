---
name: caesar-motion-audit
description: "Use to review motion that already exists, find places that should or should not animate, remove motion that does not earn its place, or produce a prioritised improvement plan another agent can execute. Read-only except in remove mode."
---

# Motion audit

Pick one mode, say which, and stay in it. Judge against the project's own motion rules first, then `caesar-motion`.

## Review (one component or diff)
Table per animation: what moves, why, property, duration, curve, interruptible, reduced-motion behaviour. Then verdicts, worst first:
- **Blocker**: animates layout properties; no reduced-motion path; runs on a keyboard action; cannot be interrupted; blocks input while leaving.
- **Fix**: over the duration limit; ease-in on an entrance; staggering a long list; permanent `will-change`.
- **Note**: taste, labelled as taste.
Each finding gives file and line, the offending value, and the replacement value.

## Find opportunities
Look for state changes with no transition: things that appear or vanish, values that jump, panels that teleport. For each candidate give the purpose in one sentence and exact values (property, duration, curve). Reject the rest in one line each with the reason (keyboard path, high frequency, data, decoration). More rejections than proposals is normal and healthy.

## Remove
Find motion the interface does not need: on keyboard-driven actions, dense lists, live data, decoration without purpose, endless loops that never pause. Delete the motion and what it leaves behind (keyframes, wrappers, delays, `will-change`, dead variables). In this mode never add or retune motion. Report lines removed and what now behaves differently.

## Improvement plan (whole codebase)
1. Inventory with a search for `transition`, `animation`, `@keyframes`, `requestAnimationFrame`, `.animate(` and motion libraries; group by surface.
2. Score each group on purpose, performance, interruption, reduced-motion and consistency of durations and curves.
3. Write independent work packages: files, the problem with evidence, the exact change, how to verify (screenshot pair, `getAnimations()` count, profiler trace), risk. A cheaper model must be able to run a package without asking you anything.
4. Order by value over effort. Source stays untouched.

## Evidence
Measure, do not guess: duration from the CSS, frames from a trace, running animations from `document.getAnimations().length` with motion off (must be 0). Quote values exactly and say what you did not run.
