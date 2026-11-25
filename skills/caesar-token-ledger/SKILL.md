---
name: caesar-token-ledger
description: "Use when you need real token and cost numbers for Claude Code turns in CAESAR, per account or per model, when extending the Usage page, or before building the budget governor or the Leader/Workers orchestrator. Triggers: tokeny, zuzycie, ledger, usage, koszt tury, budget governor, orchestrator, cache read, ile zuzylismy."
---

# Token ledger (measured, not estimated)

Every Claude Code turn CAESAR runs ends with a `result` message. `plugins/agents/drivers/tokens.ts` reads `usage` (input, output, cache read, cache write) and `modelUsage` from it (`readTokens`, `readModels`, pure and tested in `tests/token-ledger.test.ts`). The driver passes them with the account id to `onUsage`; the agents server appends a row `{ at, agent, usd, tokens?, models?, account? }` to `kv agents.usage` key `costs` (last 5000). Rows from before this change have only `usd`; `summarize()` counts them as turns without tokens.

## Read it
- `GET /api/p/agents/usage` returns `cost` (today, week, turns) and `measured` (turns, how many had tokens, token sums, per account).
- The Usage page shows it under "Last 7 days" and per account under "Claude accounts".

## Rules
1. **Measured vs estimated stays labelled.** Never present an estimate as a ledger number. Codex turns have no token rows yet (only plan windows from its session logs).
2. Plan windows (`rate_limit_event`) are percentages of a limit, not tokens; do not mix them in one sum.
3. The orchestrator and budget governor are **designed only**. Build order: ledger (done) → collect a week of numbers → one A/B on Codex research (same split and not split) → then decide. Do not build them before the numbers.
4. Live numbers stay in SQLite or kv, durable rules go to the vault (decision 007).
