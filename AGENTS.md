# Working in this repo

CaesarOS: a local-first workspace for AI agents. Bun, TypeScript, plain-JS web shell, Tauri window.

- `core/` server, engines, notes, board, sync. One file per concern, tests in `tests/`.
- `web/atrium/` the shell the person sees (plain JS and CSS, no framework). `web/` the optional build.
- `plugins/` modules; `skills/` agent skills; `packs/` fonts, icons, themes; `src-tauri/` the desktop window; `tools/` scripts.
- `docs/` plan and design records (see `docs/README.md`). Read `docs/plan/ATRIUM-PORT-PLAN-2026-11-22.md` first.

Rules: no personal data, real emails, home paths or private IPs anywhere (`tools/leak-check` runs on commit and refuses silently).
Commit explicit paths, never `git add -A`. Run `bun test` and `bun run typecheck` before a push. Branches `shell/*` and `fix/*`; `main` only through the owner.
Look: cut corners, theme tokens, own icons, no round shapes. Every function works on desktop and phone.
