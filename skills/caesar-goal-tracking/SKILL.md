---
name: caesar-goal-tracking
description: "Use when the operator talks about goals over time: a week, month or quarter plan, check-ins, numbers to watch, what slipped, assumptions to re-check, carrying an unfinished goal forward, or asks for a review of the goals. Triggers: cele, cel na tydzien, kwartal, check-in, miary, zalozenia, co sie opoznia, przeglad celow, carry forward, goal review, tracking."
---

# Goals as tracking (plugin `ledger`, page Acta, panel "Tracking")

Two layers. **Evidence goals** (`goals.ts`) close only against ledger proof. **Tracking** (`tracking.ts`) adds time and attention around them: a period per goal, check-ins, up to five measures, and assumptions with a re-check date. Tracking never closes, fails or cancels a goal and never marks a criterion met.

## Read first
`GET /api/p/ledger/tracking?tz=<zone>`: today's civil date in the zone, each goal with `period`, `phase` (current, past, future, undated), `slipping` (period over and goal still open), recent check-ins and assumptions with a `flag` (`due` or `broken`), the measures, and `attention` (what needs the operator).

## Review on request (what Caesar does)
Read `/tracking`, then the latest calendar, inbox and Dream findings only if the operator allows those sources. Say plainly: what is on track, what is slipping, which assumptions are due or broken, and the one next step. **Read only: you propose, the operator decides.** Never close a goal from a review; completion goes through the evidence gate.

## Operate
- Period: `POST /tracking/period {goalId, horizon: week|month|quarter, anchor?: YYYY-MM-DD, tz?}` (a week is Monday to Sunday; boundaries are civil dates, so a clock change moves nothing).
- Carry forward: `POST /tracking/carry {goalId}` makes a new goal in the next period with the unmet criteria and open assumptions and a link back. The old goal stays as it is; the operator closes or cancels it.
- Check-in: `POST /tracking/checkins {goalId?, text}`. Measure: `POST /tracking/measures {name, unit?, value, source?}`, update with `PUT /tracking/measures/:id`; the source is always named.
- Assumption: `POST /tracking/assumptions {goalId, text, recheckOn}`, then `POST /tracking/assumptions/:id/check {status: "holds"|"broken", note?, nextCheck?}`. A broken one stays flagged until `POST .../resolve`.

## Rules
1. A measure filled by a source names that source; a number without a source is the operator's own.
2. Do not invent check-ins or measures to make a goal look on track.
3. Same functions on desktop and phone: every action in the panel is a visible button.
4. Pure logic (periods, phases, flags) lives in `tracking.ts` and is tested in `tests/goal-tracking.test.ts`; extend it there.
