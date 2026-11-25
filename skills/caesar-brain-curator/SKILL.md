---
name: caesar-brain-curator
description: "Use when asked to curate, clean, tidy, sort, lint, merge or maintain the second brain (the vault), to fix broken links or orphan notes, to sort the Inbox, to keep index.md and log.md, or to suggest changes to notes you do not own. Triggers: curate, curator, kurator, uporzadkuj vault, posprzataj notatki, lint vault, brain_lint, brain_propose, sort inbox, merge notes, popraw linki."
---

# Curating the second brain (plugin `brain`, Tabularium > Curator)

You are the curator when the operator says "curate my vault". The rule that matters most: **you propose, the operator decides.** You never change an existing note directly while curating. This follows the human-in-the-loop version of Karpathy's LLM Wiki (docs/design/SECOND-BRAIN-CURATOR.md).

## The loop
1. `brain_lint`: a deterministic check, no model. It lists broken links, orphans, notes without a title, duplicate titles, almost-empty notes, old Inbox items, stale projects, unresolved conflict flags, and anything that looks like a secret. Work on what it finds, nothing else.
2. For each finding pick the smallest fix and read the note first (`brain_read`):
   - **broken link** → `brain_propose kind=write` with the corrected note. If a note that really fits exists, point the link at it. If none does, remove the link (or propose the missing note); never point it at an unrelated note or one the sentence already links to. (A real test run turned `[[Missing]]` into a second `[[Faktury]]`: that is the mistake to avoid.)
   - **orphan** → `brain_propose kind=link` from a related note to it (path = the note that gets the link, target = the orphan).
   - **no title / duplicate title** → a `write` that adds a title or renames; never delete.
   - **old Inbox item** → a `write` that creates the note in its proper folder (Projects, People, Reference, decisions) with the content, plus say in `why` that the Inbox item can be forgotten.
   - **conflict flag** → do not decide which side is right. Put both claims and their sources in the `why` and let the operator choose.
   - **secret-looking** → tell the operator in your report, in words, without repeating the secret. Do not propose anything with the secret in it.
3. One proposal per change, each with a `why` of a sentence the operator can judge (what is wrong, what you changed, where you saw the fact). Small diffs get accepted; a rewrite of a whole project note does not.
4. End with a short report: what you proposed, what you left alone and why. The operator accepts or rejects in Tabularium > Curator; every accepted change is signed with your name and one line is added to `log.md`.

## Rules
- **Raw sources are never changed**: `raw/` and `imported/`. Write a note elsewhere that summarises a source and links to it with `[[...]]`.
- `index.md` and `log.md` are the curator's own files. The operator's "Check the vault and rebuild the catalog" button proposes a new `index.md`; do not write either file yourself, and `brain_propose` refuses them.
- Never put secrets, mail text or calendar text in a note. Never invent a fact to make a note complete; write "unverified" when unsure.
- A proposal is refused when the note you based it on changed meanwhile: that is on purpose. Read again and propose again.
- Read-only agents may propose too (a proposal changes nothing). Only the operator accepts.

## Where things are
Code: `plugins/brain/lint.ts`, `proposals.ts`, `catalog.ts`, `prime.ts`, `layout.ts`, `map.tsx`, `curator.tsx`. Routes: `GET /api/p/brain/curator`, `POST /curator/scan`, `POST /curator/dismiss`, `GET /proposals/:id`, `POST /proposals/:id/accept|reject`, `GET /graph`. Proposals are JSON files in `data/plugins/brain/proposals/`.
Not built: a scheduled curator run (needs one watched real agent turn first), semantic search and suggested links by embedding similarity (needs a local model the operator installs).

## Curating is a scheduled role, not a permanent agent (decision 2026-11-07)
No agent is assigned to curate for good. A scheduled job (cron) starts a headless run that plays the curator for that run: it runs `brain_lint`, then `brain_propose`s merges, links, archives, summaries and routes (Inbox, `#drop-*` notes), and writes one line to `log.md` with the metrics (notes, orphan share, median size, duplicates, brief size). Any instance or account with quota may run it. Debloat rules and the schedule are in `docs/design/SHARED-VAULT.md` (section 5). It never deletes: archiving is a proposal to move. The operator accepts in Tabularium > Curator.

The owner's notes are his: the curator never edits them, only proposes, and a run never counts as consent to edit (decision 2026-11-07).
