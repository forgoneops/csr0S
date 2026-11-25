---
name: caesar-brain-import
description: "Use when the operator wants to bring notes or conversations into the second brain: an Obsidian vault, a Notion export, a ChatGPT export, or Claude Code and Codex session logs; or when adding a new import source. Triggers: import, importuj notatki, Obsidian, Notion export, eksport ChatGPT, conversations.json, historia sesji, przenies do vaulta, Tabularium import."
---

# Importing into the second brain (plugin `brain`, Tabularium > Import)

Five sources, each with its own switch: `obsidian`, `notion` (folder or .zip, needs `unzip`), `chatgpt` (`conversations.json`), `claude-sessions`, `codex-sessions`. Session logs are **off by default** (they hold more than the operator remembers); the rest are on.

## The flow (always this order)
1. Switch the source on if needed: `PUT /api/p/brain/import/sources {id, enabled}`.
2. **Preview:** `POST /import/preview {source, path}` reads the folder read-only and returns counts (found, new, existing, skipped) and a sample. It writes nothing.
3. **Run:** `POST /import/run {source, path}` writes only notes that do not exist yet, under `imported/<source>/`, signed `updated_by: import:<source>` and `imported_from:` in the front matter. An existing note is never overwritten; nothing is deleted. Running twice is safe.

## Rules (hard)
1. **Operator only.** The routes read a path on this disk, so agents (even with a token) get 403. Never run an import on the operator's behalf without his say-so; show the preview and let him press Import.
2. The operator's real vault gets **no second copy** and no import into it without his yes; imports land inside the CAESAR vault (`data/plugins/brain/vault`).
3. Sessions: only the words of the operator and the assistant (no tool calls, results or thinking), credentials redacted by `core/redaction.ts`, one note per session capped at 120 KB, files over 25 MB and totals over 200 MB skipped and reported.
4. Links out of the folder are not followed; dot folders (`.obsidian`, `.git`, `.trash`) are skipped.
5. Say what was skipped. A preview that hides skips is a lie.

## Adding a source
Write a pure parser in `plugins/brain/import/parsers.ts` (text in, `{dest, text}` out, tested with small samples in `tests/brain-import-parsers.test.ts`), add the source to `SOURCES`, the walk in `files.ts` (`plan`), a default in `DEFAULT_ON` in `server.ts`. Real exports are big and private: test with invented samples, never commit real data.

## Not done yet
A Notion API import (only the export), per-note selection in the preview, Obsidian `[[link]]` repair across sources, semantic search over imports (next: M3 FTS5 search).

## Keep imports up to date, and what a switch means (2026-11-06)
- **Keep up to date** (Tabularium > Notes > Import, bottom): name a folder per source, pick how often (15 minutes to a day), switch **Import by itself** on. Off by default. A timer then repeats the same import (`POST /import/schedule/run` does it now): only sources that are switched on and have a folder, never overwriting, so a note you edited stays yours; a session that grew after its first import is not refreshed. Result per source ("2 new, 40 already there" or the error) shows under its folder. Routes: `GET` and `PUT /import/schedule`, `POST /import/schedule/run`; code `plugins/brain/import/schedule.ts`.
- **The per-source switch also hides.** A switched-off source stays in the vault but its notes (`imported/<source>/`) are out of search, lists and the agents' tools (`brain_search`, `brain_list`, `brain_read`, `brain_today`). The server mirrors the switches into `import-state.json` next to the access policy so the agents' own process sees them. Switching on brings the notes back at once. Session logs are off by default.
