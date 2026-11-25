---
name: caesar-hermes-mirror
description: "Hermes Mirror (Speculum): what Hermes keeps itself, shown read only in CAESAR: the skill curator, the kanban board and the learning journey. Use when asked what Hermes learned, which skills the curator will archive, what is on Hermes' kanban board, or to see the memory graph. Triggers: hermes curator, kanban hermesa, journey, czego nauczyl sie hermes, tablica zadan hermesa, skille do archiwizacji"
---

# Hermes Mirror (Speculum)

Pack `dev`, edition `owner`, plugin `plugins/hermes-mirror/`. Spec: `docs/research/HERMES-NATIVE-2026-11-07.md` rows 4, 7 and 8. **Read only**: it changes nothing in Hermes. Operator only (it shows his memories).

| Route | Hermes command | What |
|---|---|---|
| `GET /curator` | `hermes curator status` (text, parsed) | state, runs, intervals, counts (managed, active, stale, archived, unmanaged), most and least active skills |
| `GET /kanban[?board=]` | `kanban boards list --json`, `kanban --board <slug> list --json --archived` | boards and the tasks of one board in columns |
| `GET /journey` | `hermes journey --json` | skills and memories oldest first, with links and use counts |

Each answer is kept for a minute (the CLI takes seconds); `?fresh=1` asks again. Argument arrays only; a board name must match `[a-z0-9_-]`. A CLI that is missing answers 503, an answer in another shape 502 (the commands move between Hermes releases).

## Where it is shown
One page, "Hermes Mirror", with three tabs. Putting each tab into its own home (Skills, Campaigns, Tabularium) is a UI job for lane a; the routes are ready.

## Later, each with a yes in Activity
Curator run, pin, archive and restore; creating or assigning kanban tasks; editing a journey node. None of these exist yet.

## Not tested live against a write
There is nothing to write. Parsers were checked against the real output of Hermes 0.22.6 and with fixtures.
