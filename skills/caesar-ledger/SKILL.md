---
name: caesar-ledger
description: "Use whenever you claim that work was done, tested, reviewed or shipped. The evidence ledger records what CAESAR observed; goals close only against it. Prepared is not observed."
---

# The evidence ledger

CAESAR keeps an append-only record of what was actually observed (plugin `ledger`, `plugins/ledger/`). A claim in a report, a mission or a Forge approval is only as strong as the row behind it.

## Two axes, always shown together
**Phase:** Route, Plan, Code, Setup, Test, Review, Ship. **Confidence:** not run, running, partly seen, reported done, seen, failed, verified, blocked, cancelled. Read as `Test · verified`, `Plan · not run`.
- **reported done** is someone's own report about their own work. It is never proof.
- **seen** and **verified** are the only confidences that can back a claim, and they need a `ref` pointing at the proof (a message, a test run, a diff, a backup). The ledger refuses them without one.
- A word like "complete", "passed", "merged" or "ready" in a report must be backed by a seen or verified row. If there is none, say what is prepared and what is not run yet.

## Writing evidence (from code)
```ts
import { record } from "../ledger/host";           // tryRecord on a hot path
record({ source: "test", actor: "forge", subjectKind: "forge", subjectId: jobId, phase: "test",
         confidence: "verified", claim: "bun test: 237 passed", ref: `forge:${jobId}:tests` });
```
Store a reference and a short claim, never message text or file contents. A correction is a new row with `corrects: <id>`; rows are never edited or deleted.

## Reading
`GET /api/p/ledger/evidence?subject=forge:<id>`, `/standing?subject=kind:id` (per phase), `/claim?subject=kind:id&phase=test` (may we say it is done?), `/vocab`.

## Goals
`POST /api/p/ledger/goals` with a title, acceptance criteria and gates (tests, review, privacy, build, backup). A criterion is met only by pointing at a seen or verified row (`.../criteria/:cid/satisfy { evidenceId }`); a gate passes the same way. `complete` is refused while any criterion, gate or blocker is open and says what is missing. Use a `mutationId` so a retry does not repeat an action.

## Rules
1. Do not write "verified", "passed" or "done" in a summary unless `canClaim` says yes or you can cite the row.
2. Report failures and gaps as plainly as successes. A `failed` row is evidence too.
3. The vocabulary is our own (`plugins/ledger/vocab.ts`, pinned by `tests/ledger-vocab.test.ts`); the idea of two axes came from oh-my-hermes, the code and wording are ours.
