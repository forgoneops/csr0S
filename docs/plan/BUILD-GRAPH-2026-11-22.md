# The CaesarOS build as a graph (nodes, edges, state, gates)

Source: an X article on "graph engineering" linked by Konrad (account 0xShoopy, 2026-08-06): split work into specialist agents (nodes), route between them with deterministic rules (edges), share a state file, and let an objective gate decide done. This note applies it to our build; it is orchestration of the crew, not a new product feature (that can come later as a Caesar workflow primitive).

## 4-question filter (is a graph justified?)
Repeats (every step of S0 to S8, N0 to N7): yes. Different kinds of work need different handling (look, shell code, packaging, QA, specs): yes. The author must not approve their own work: yes. A single loop already misses things (the register had to be reconciled by hand twice): yes. So we use a graph, at **autonomy level 1** (manual runs we watch). No scheduled or cloud runs until five manual steps ran clean.

## Nodes (one verb each, scoped tools)
| Node | Who | Verb | Cannot |
|---|---|---|---|
| Router | Primus (claude-a) | route work, update state | write product code |
| Shell | Vitruvius | build shell and native | merge, deploy, change tests to pass |
| Look | Agrippa | design kit and theme | touch backend |
| Platform | Annona | audit, packaging, backend, cleanup lists | delete legacy before archive |
| Verify | Varro | check against register and screenshots | edit source it verifies |
| Specs | claude-b | study, write clean-room specs | put raw extracts or code in git |
| Second view | Hermes | cross-check and independent review | write code |
| Track | Balbus | cards and status | start runs, take over the plan |
| Leak check | Cd | client-edition and owner-layer leaks | ship |

## Edges (deterministic, not prompts)
- Work for a step goes Router, then the owner node, then Verify, then the human gate. No node approves its own output.
- Anything touching main, deploy, restart, release, client update, publishing or sending leaves the graph only through the **human gate** (Konrad's yes each time). There is no edge to those actions.
- Pro-study output goes Specs, then a clean-room scan, then repo; raw extracts have no edge into git.
- A failed hard gate routes back to the owner node with the failure text; after two failures it escalates to Router, then Konrad.

## State
`docs/STATE.md` in the repo is the shared state: per step, owner, branch, last commit, gate results, open questions. Each node reads only its slice. The register `BUILD-REGISTER-*.md` stays the authority for "is it done".

## Gates
| Type | Check | Where |
|---|---|---|
| Hard | `bun tools/plan-check.ts`; type check and build; core-alone build fails on any import from `owner/` (R45); deleting `owner/` leaves build, tests and start green (R45); pack swap test, no direct icon or font import (R46); screenshot matrix 390x844 and 1440x900, motion Full and Off (R48); clean-room scan: no code blocks or long strings copied from `~/analysis` into docs (new check to build) | CI and per step |
| Soft | a different crew member reviews (never the author); Hermes second view | per step |
| Human | Konrad for main, deploy, release, licence-adjacent decisions, theme and UX approvals | step end |

Gates rot: every few steps spot-check an approved item by hand and break a throwaway copy on purpose to see the gate fail.

## Debt to watch (from the article, true for us)
Read the diffs; keep the graph on machine-checkable work; design and architecture choices stay with Konrad and Primus. The orchestrator must not stop forming opinions because the graph runs quietly.

## Keep working past limits (relay, 2026-11-22)
`tools/relay.py` runs every 5 minutes on the VPS (user timer `relay.timer`, log `~/orchestra/relay.log`, queue `~/orchestra/queue.json`). Each task has a **fallback chain** of crew profiles. When a worker's run ends with a limit message (rate limit, usage limit, quota, resets in, try again later) or with no report, the relay retries once on the same worker if it ended silent, otherwise hands the task to the next worker with a note to read the branch state and not redo finished work. When the chain is exhausted the task is `blocked` and waits for Primus. Dependent tasks start only after their predecessors are `done`; at most 3 runs at once. It never merges, deploys, restarts or publishes; "done" only means the worker reported, review and gates still belong to Varro and Konrad. Stop it with `touch ~/orchestra/PAUSE`; `python3 relay.py queue.json --dry` shows what it would do and writes nothing.
Limits of this design: it covers crew runs on the VPS. The interactive panes on the Lenovo (claude-b, Hermes) are not under it; they retry after a limit by themselves (Hermes waits and retries) and their work is tracked in `docs/STATE.md`. The Claude accounts fail over inside the existing bridge.
