---
name: caesar-update
description: Update a CAESAR install to a new version with a way back, or take the last update back. Use when the operator asks to update, upgrade, roll back, undo an update or check which version is installed; also before any risky change to an install. Triggers: update, aktualizacja, cofnij aktualizacje, rollback, undo, wersja.
---

# Update with undo

`bun tools/caesar-update.ts` (code in `tools/update-lib.ts`, tests in `tests/update.test.ts`). Stop CAESAR first: undo replaces the database file.

| Command | What it does |
|---|---|
| `status` | the version (commit) now, and the last ten backups with their status |
| `snapshot` | a backup now: a consistent copy of the database (`VACUUM INTO`, safe while it runs) and where the code is |
| `apply <tag, branch or commit>` | snapshot, switch the code to that version, run the build; if the switch or the build fails, the previous version and database are put back at once |
| `undo` | no network and no key: the newest applied backup, code back to its commit and the database back from the copy |

Backups live in `data/update-backups/<id>/` with a `backup.json` (`ready`, `applied`, `undone`, `failed`).

## Rules
- It refuses when the install has uncommitted changes (it never touches them) and when the version name has odd characters.
- The vault, media and settings files are not part of the backup: an update never edits them. The database copy is taken before the switch and restored only by `undo`.
- Data written after the update is lost by undo (the database goes back): say so before running it.
- Updating the nightly of the owner's own development tree is not what this is for; it needs a clean checkout, as a customer install has.
- Not built yet: a Settings > Updates card, signed packages and a release channel (where versions come from is a decision).
