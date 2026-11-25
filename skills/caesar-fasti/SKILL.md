---
name: caesar-fasti
description: "Fasti (the calendar of days and duties): goals by day, week, month and quarter, nested, with the Sunday and month-end reviews and the carry-forward the owner approves. Engine in plugins/ledger (fasti.ts, tracking.ts). Use when asked what is on this week, to plan the day, set a goal for a period, nest goals, review the week, or carry unfinished goals forward. Triggers: fasti, cele, cel na tydzien, plan dnia, przeglad tygodnia, niedzielny przeglad, przenies na nastepny tydzien"
---

# Fasti (engine, lane b; the page is lane a)

Pack `core`, standard edition. Built on `plugins/ledger/tracking.ts`; no new store. **A review and a carry-forward never close, fail or cancel a goal**: only the owner does that, against ledger proof (`goals.ts`).

## Model
- **Horizons**, small to large: `day`, `week` (Monday to Sunday), `month`, `quarter`. A goal gets one period with `POST /api/p/ledger/tracking/period { goalId, horizon, anchor?, tz? }`.
- **At most three open things a day** (the limit is in the engine; the error says "finish or move one first").
- **Nesting**: `POST /tracking/parent { goalId, parentId|null }`. The parent must be a bigger horizon and its period must contain the child's. A day serves a week serves a month serves a quarter.
- **Progress** per goal is its criteria (`progress: { met, total }`); a goal whose period passed and is still open is `slipping`.

## What the page reads
`GET /api/p/ledger/fasti?tz=` returns `horizons: [{ horizon, period, goals: [{ ...goal, children, parent }], open }]` for the current day, week, month and quarter, plus `slipping`, `unplaced` (open goals with no period) and `attention` (assumptions due or broken). Check-ins, measures and assumptions stay on `/tracking`.

## Reviews
- Read only preview: `GET /fasti/review?kind=week|month|quarter&date=` (done, open, what would carry, a plain text).
- **Automatic**: every ten minutes the plugin checks; from 17:00 local on the last day of a week (Sunday), month or quarter it puts the review in **Activity** (Needs you, source `fasti`, opens `/fasti`), once per period, only if the period holds a goal.
- **Approve** = the owner's yes to carry the open goals forward: each becomes a new goal in the next period with `carriedFrom` pointing at the old one (old goals stay). **Dismiss** leaves everything as it is.
- Post one now: `POST /fasti/review { kind, date? }`.

## For the voice and the brief
"What is my week" = `GET /fasti`, horizon `week`. The daily brief can read `horizons[0]` (today) and `slipping`.

## Checked
Tests in `tests/goal-tracking.test.ts` (periods, the day limit, nesting rules, review text, due times, once per period, carry handler). Not yet seen with a real Sunday evening on the nightly; the time check is pure and tested with fixed clocks.
