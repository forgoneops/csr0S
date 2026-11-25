---
name: caesar-scriptorium
description: "Use when working on or explaining Scriptorium, the owner's own Obsidian-like Markdown workspace on the vault: file tree, tabs, live-preview editor, wikilink completion, autosave, add-on plan."
---

# Scriptorium

The owner's editor for the vault (`/scriptorium`, plugin `scriptorium`, family tab under Tabularium). Design and build order: `docs/design/SCRIPTORIUM.md` (S1 to S6). Built so far: **S1 to S5** (S6, a second vault folder, is open).

## What exists (S1)
- Tree of all notes (folders first, natural order, filter that folds Polish letters, `+` creates `Folder/Name`), tabs that survive a reload, per-tab undo history.
- CodeMirror 6 editor (`editor.ts`): Markdown, Live Preview (marks hide on the lines the cursor is not on; headings, bold, italic, strike, code, fences, quotes, callouts, tasks, wikilinks), properties block dimmed, `[[` completion from the vault, Ctrl/Cmd+S, autosave after 1.5 s.
- Saves with `PUT /api/p/brain/note` (the vault signs it as the owner), detects a change made elsewhere (Keep mine / Load theirs), presence heartbeat while a note is open (agents are refused on it), Delete moves to `.trash`, Reading view, formatting toolbar and a Files drawer for the phone.

## Also built
- S2: links panel (outgoing and backlinks), quick switcher (Ctrl/Cmd+O), search operators in the filter (`path:`, `title:`, `tag:`, `-word`, quotes), rename with link update (`POST /api/p/brain/rename`, old name to trash), tags pane.
- S3: properties panel (front matter as typed fields; the vault's own lines are never shown or touched), slash menu (headings, lists, task, quote, callouts, code, divider, table, link, date), outline.
- S5: **add-ons** and a command palette (Ctrl/Cmd+P or the Commands button). An add-on is a folder `data/plugins/scriptorium/addons/<id>/` with `manifest.json` (`id` = folder, `name`, `permissions`) and `main.js`. It runs in the owner's page with `api` = `events.on("note-open"|"note-change"|"note-close")` always, plus what its permissions ask: `commands` (`api.commands.add({id,name,run(ed)})`, `ed` = insert, text, selection, replaceSelection), `editor:extend` (`api.editor.extension(cm6Extension)`, `api.cm`), `status-bar` (`api.statusBar.item().set(text)`), `vault:read` (`api.vault.list/read`), `network` (`api.fetch`). Three samples ship in `plugins/scriptorium/addons-samples/` (Add-ons, "Install the sample add-ons"). Honest limit: no hostile-code sandbox, the owner switches on only code he wrote or read; Obsidian's own plugins are not binary-compatible (see the design doc).

- S4: **Base viewer** (`.base`: table, list and cards; filters with and/or/not, comparisons, `file.hasTag`, `file.inFolder`, properties, contains/startsWith/isEmpty, sort, group, limit, column names; formulas are listed as "not evaluated", never guessed) and **Canvas viewer** (`.canvas`: text, file, link and group nodes, colours, labelled edges, zoom and move buttons). Both read only; the Source button edits the text. Files come through `GET /api/p/brain/files|file|properties` and `PUT /file` (operator only, contained in the vault, canvas must stay valid JSON).
- Add-on install scan: before an add-on is switched on, its code is read for network calls, CAESAR API calls, eval, markup injection, storage and escapes; a "danger" needs a second click. A plain read, not a sandbox.

## Rules
1. It writes only what the owner types or a button inserts. Never save, reformat or "fix" a note on open.
2. Everything has a tap target (toolbar buttons, Files drawer); no hover-only or shortcut-only function.
3. Same data path as the agents: the Memory routes. No second store.
4. New behaviour comes from the S4 and S6 items of the design doc (`.base` and `.canvas` viewers, a second vault folder). Add-ons use the API above; never give an add-on a write path to the owner's notes beyond what the editor itself does.

## Files
`plugins/scriptorium/` `client.tsx` (view), `editor.ts` (engine), `tree.ts` (pure, tested), `client.css`; `tests/scriptorium-tree.test.ts`.
