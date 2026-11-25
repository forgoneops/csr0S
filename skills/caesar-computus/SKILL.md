---
name: caesar-computus
description: "Use when the owner asks what the agents cost, whether the plans pay off, or how many tokens went where: Computus (plugin rations) reads the session logs on this machine and shows tokens and API-equivalent spend per day and model, plans vs tokens, and the break-even against the value of his hour."
---

# Computus (plugin `rations`)

Page `/rations`, a tab next to Usage in the Lair family. The Usage page ("Rations") shows plan windows and plan prices; Computus adds the whole-machine history.

## What it reads
Claude Code session logs of every account (`projects/**/*.jsonl`, each real file once, a message once by id) and Codex session logs (the last running total of each session). Read only, streamed, cached per file in `data/plugins/rations/usage-cache.json`. Nothing leaves the machine.

## What it shows
- API equivalent over 7, 28 or 90 days, tokens, turns, active days; per day (chart or table) and per model family.
- Plans: the monthly total comes from Settings (Usage page, "Your plan prices"), the same source as Usage. **Plans vs tokens** is the API equivalent divided by what the plans cost over the window.
- **Your hour:** the owner types what an hour of his work is worth. Break-even = plan cost over the window divided by that. If CAESAR saved him more than that many hours, the plans paid off.

## Rules
1. **The API figure is an estimate.** Prices per million tokens are editable defaults (cache reads at a tenth, writes at one and a quarter). Say "would have cost per token", never "you spent". It is not a bill.
2. Do not claim hours saved: the page does not measure time saved, only the break-even.
3. `GET /api/p/rations/summary?days=28` (answers `{scanning:true}` during the first read after a restart), `GET|PUT /api/p/rations/settings` (hourly value, prices; PUT is operator only).
4. A known trap: the second Claude account links its `projects` to the first; files are deduplicated by real path or every turn counts twice.

Source `plugins/rations/` (`usage.ts` logs, `money.ts` prices and ROI, `server.ts`, `client.tsx`); `tests/rations.test.ts`.
