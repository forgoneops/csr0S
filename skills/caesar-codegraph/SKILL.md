---
name: caesar-codegraph
description: "Use before a code task or a review. A static map of CAESAR's own source: which files to read first for a task, which tests a change can reach, who imports a file, import cycles. Read only; every answer is a hint, not proof."
---

# Codegraph

A static map of this repository (TypeScript and TSX): files, what each exports, who imports whom, the routes each plugin serves. It parses source text only and never runs it. Plugin `codegraph`, scanner in `plugins/codegraph/`, shell tool `tools/codegraph.ts`.

## When to use it
- **Before briefing a coder** (the developer, Forge, a mission): run `handoff` for the task and put the top files in the brief. Smaller briefs, fewer blind searches.
- **Before saying a change is tested:** run `tests --changed` on the diff. Run those tests first. The full suite still runs before anything is called done.
- **Before deleting or moving a file:** `file <path>` shows what imports it. Not on that list does not mean unused (see blind spots).
- **When asked how the code fits together:** `summary` (most imported files, plugin sizes, import cycles).

## Commands
```
bun tools/codegraph.ts summary
bun tools/codegraph.ts handoff "add folders to the media gallery" --files plugins/media/model.ts
bun tools/codegraph.ts tests --changed $(git diff --name-only)
bun tools/codegraph.ts file web/src/pages/Forge.tsx
```
Add `--json` for the full payload. The same through the API: `/api/p/codegraph/` `summary`, `handoff?task=&files=`, `tests?files=`, `file?path=`, `status`, `graph?refresh=1`. It rebuilds on its own when the source changed.

## Graphify registry (any folder, with communities)
`GET /api/p/codegraph/graphs` lists the Graphify graphs built on this machine (name, source, nodes, edges, communities, report path). **Read the registry first**, then the report (`/graphs/file?id=<id>&kind=report`) before opening files; ask the graph file (`/graphs/file?id=<id>`) for paths and neighbours (`graphify path|explain --graph <file>`). `POST /graphs/build {"path": "/abs/folder"}` (operator only) maps a folder: the files are copied into the plugin data dir first (no `.env`, keys, junk dirs), so nothing is written next to the source. `graphify-mcp` is an optional MCP tool you register yourself; nothing is written to `~/.claude`.

## Rules
1. **A hint, not evidence.** Every payload carries `claimBoundary` and `blindSpots`. Do not write "verified", "reviewed" or "safe" because the graph said so.
2. **Blind spots are real.** Plugins load by folder name, not by import. Computed imports are missed. A test that builds a path is not linked to it. A file with no importer may still be a script, an entry or a spawn target.
3. **Selected tests are a starting point.** `No test reaches these files` is a finding to report, not a pass.
4. **The graph is rebuilt from source and never edited.**
5. Ranking words come from the task text; if the repo has no file for the idea yet (a feature not built), the list shows the nearest neighbours, not the answer.

## Source and tests
`plugins/codegraph/scan.ts` (build), `select.ts` (tests, handoff, summary), `server.ts` (routes), `graphs.ts` (Graphify registry); `tests/codegraph.test.ts`, `tests/codegraph-registry.test.ts`. Design notes: `docs/research/OMH-CODEGRAPH-2026-11-03.md`.
