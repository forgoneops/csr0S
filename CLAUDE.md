# Working in this repo

CaesarOS: a local-first workspace for AI agents. Bun, TypeScript, plain-JS web shell, Tauri window.

- `core/` server, engines, notes, board, sync. One file per concern, tests in `tests/`.
- `web/atrium/` the shell the person sees (plain JS and CSS, no framework). `web/` the optional build.
- `plugins/` modules; `skills/` agent skills; `packs/` fonts, icons, themes; `src-tauri/` the desktop window; `tools/` scripts.
- `ARCHITECTURE.md` explains the layout and the rules between the blocks. Read it first.

Rules: no personal data, real emails, home paths or private IPs anywhere (`tools/leak-check` runs on commit and refuses silently).
Commit explicit paths, never `git add -A`. Run `bun test` and `bun run typecheck` before a push. Branches `shell/*` and `fix/*`; `main` only through the owner.
Look: cut corners, theme tokens, own icons, no round shapes. Every function works on desktop and phone.

## Brain and memory saving (every agent)
What you save to the Brain or memory from a session is the decisions taken and the reasoning behind them (the owner's words, constraint, trade-off, rejected alternative). Not activity logs or file lists; git and handoffs hold those.

## Your data never enters the repo
The person's data lives in the data dir (`~/.local/share/caesaros`), never in a repo. Agents test on temp dirs. Never copy real notes, mail, vault files, client names, keys or hosts into tests, fixtures, docs or commit messages; use invented samples. Real-app screenshots go to `~/caesaros-evidence`. `tools/data-guard.ts` runs before every push and export.
