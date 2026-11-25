---
name: caesar-second-brain
description: "Use when anything must be remembered, looked up or written down for the long term: the operator's people, projects, decisions, preferences, meetings; when asked to 'zapamietaj', 'sprawdz w pamieci', 'second brain', 'vault', 'notatki'; or when setting up, checking or widening who may read and write the brain."
---

# The second brain (plugin `brain`, page Tabularium)

A vault of plain Markdown on disk (`data/plugins/brain/vault`), shared by the operator and the crew. Every agent turn started from CAESAR carries the `caesar-brain` tools. Read the note `AGENTS` in the vault first: it is the protocol (where things live, how to read and write, what never to do).

## Use it
1. `brain_search` before you answer from memory about a person, a project or a past decision; `brain_read` the best hit; `brain_list` to browse a folder.
2. **Take notes the operator dictates.** `brain_capture` with their words: a time ("o 16", "za godzinę") becomes a calendar reminder plus a line in that day's Plan, a day becomes a day entry, rebuild talk goes to `projects/caesar/backlog/`, the rest to `Inbox/`. Say where it went.
3. **Drop your knowledge into it.** Anything that should outlive this conversation (a decision and its reason, an operator preference, how a setup really works, a fix that took effort, a project's state) goes into the brain before you finish; do not keep it only in your own memory. Read-only agents end their report with a `For the brain:` block of short, sourced lines and Caesar files them. When the operator asks you to "wrzuć to do pamięci" or "drop it in the brain", this is that. Write only if you were given write access: `brain_remember` for one durable fact, `brain_write` for a whole note. Search first, extend a note instead of copying it, say where a fact came from, mark guesses "unverified". Every write is signed with your name.
4. Folders: Inbox, Daily, Projects, People, Meetings, Reference, decisions, facts. Each has a README with its naming rule.

## Retrieval and curation (new)
- `brain_search` is a fused search: all words, any word, fuzzy (accent-folded trigrams: "lodz" finds "Łódź", a stem finds an inflection), notes linked to the best hits, a small weekday/month/season boost, and a note named like the query comes first. Each hit says how it was found (`via`).
- `brain_prime(job)` loads a recurring job's note from `Jobs/` and exactly the notes it links to. No job note yet: it lists the jobs, and you can write one.
- `brain_lint` is a deterministic health check; `brain_propose` suggests a change (the operator accepts it in Tabularium > Curator). See skill `caesar-brain-curator`. The interview is skill `caesar-brain-onboarding`.
- `index.md` (catalog) and `log.md` (append-only, `## [date] op | title (by)`) belong to the curator; `raw/` and `imported/` are sources nobody edits. `brain_write` refuses all of them.
- Tabularium has four views: Notes, **Map** (notes as nodes, real `[[links]]` as edges, folder filters, find, a List twin), **Curator**, History.

## Never
Secrets in notes. The text of the operator's mail or calendar (those belong to the assistant). Deleting anything (nothing can be deleted by an agent; the operator's Forget moves a note to `.trash`). Rewriting another agent's note without reading it. Working around a refusal: access is the operator's setting.

## Search and capture
- `GET /api/p/brain/notes?q=` searches through an SQLite FTS5 index (`plugins/brain/searchindex.ts`): title and tags weigh more than the body, accents are folded, a new note is found at once. The index lives next to the vault, can be deleted any time and is rebuilt; if it fails the old scan answers. The agents' `brain_search` tool uses the same fused index (falls back to the scan if it cannot open).
- `POST /api/p/brain/capture {text, title?}` (operator) saves one thought to `inbox/` signed `operator`; Tabularium has a Capture box at the top. Sort the Inbox later; do not file captures yourself without being asked.

## Set it up and check it
- **Tabularium > "Create my vault"** makes the folders, the protocol notes and the first access policy (everyone reads, only Caesar writes). It never overwrites. `GET /api/p/brain/status` says what is missing; `POST /api/p/brain/provision` does the same as the button.
- **Settings > Brain access** widens or narrows read and write per agent, one at a time. Until a policy is saved the vault is in `legacy` mode (everyone reads and writes): tell the operator if you see it.
- The policy guards the brain tools only. An agent that runs outside CAESAR (the operator's own terminal) is not wired automatically; show the operator what to add, never edit their global agent config yourself.

## Not built yet (do not promise)
Semantic (meaning-based) search by embeddings (needs a local model the operator installs) and suggested links by similarity. Built: imports (`caesar-brain-import`), vault sync (`caesar-vault-sync`), full-text search and quick capture (below). Plan: `docs/PLAN.md`, item 11 (M).
