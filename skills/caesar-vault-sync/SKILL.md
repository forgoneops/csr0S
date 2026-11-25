---
name: caesar-vault-sync
description: "Use when the operator wants the second brain backed up, versioned or copied to another machine through git, asks about syncing the vault, a private remote, or why a sync stopped. Triggers: sync vaulta, synchronizacja, kopia notatek, git vault, prywatne repo, vault sync, backup notatek, sync zatrzymany."
---

# Vault sync (plugin `brain`, Tabularium > Vault sync)

Git over the CAESAR vault (`data/plugins/brain/vault`): history on this machine and a copy on a **private** remote the operator names. Code: `plugins/brain/sync.ts`; tests: `tests/brain-sync.test.ts` (real git, local bare remote, no network).

## Rules (hard)
1. **Off by default, never automatic.** It runs only when the operator presses Sync now (`POST /api/p/brain/sync/run`) after switching it on. Do not schedule it, and never push on your own.
2. **Remote is the operator's choice and must be private.** Accepted: `git@host:path`, `ssh://`, `https://`, `file://` or a local path. Anything that reads as an option or contains shell characters is refused. Never put credentials in the URL; auth is the operator's ssh key or credential helper.
3. **Only CAESAR's own vault.** The operator's real Obsidian vault (`/srv/vault`) gets no second copy and no sync without his yes.
4. **A note that looks like it holds a credential stops the commit** and the files are named. Fix the note; never loosen the check or bypass it.
5. **A diverged branch is reported, never merged or forced.** The vault and the remote both changed: tell the operator, who resolves it by hand in the vault folder.
6. `.trash/` never leaves the machine. Operator only: agents get 403.

## Read the state
`GET /sync/status` (operator): initialized, remote, branch, unsaved files, ahead, behind, last commit. Durable data only goes through git; live numbers stay in SQLite (decision 007).

## Not done yet
A name for the feature (working name: vault sync; the name is Caesar's pick), a VPS as the hub (a deploy key is the operator's step), pull-only mode, conflict help in the UI.
