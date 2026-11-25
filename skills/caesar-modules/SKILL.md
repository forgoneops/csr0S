---
name: caesar-modules
description: What each CAESAR module (plugin and page) does, where its API lives and how to check it is working. Use when asked how a page works, to use or verify a module, or before changing one.
---

# CAESAR's modules

Every module is a plugin in `plugins/<id>/` with a `plugin.json`; its API is under `/api/p/<id>/`, its page is the nav path. CAESAR runs on `127.0.0.1:4400` (service `caesar`); health is `GET /api/health`. Names in parentheses are the names in CAESAR's world, shown when "plain names" is off.

| Module | Page | What it is for | Check it with |
|---|---|---|---|
| agents | `/chat` (Audience), `/lair` (The Lair), `/usage` (Rations) | chat with Hermes, Claude Code, Codex; the crew's own chat, hire and retire, the log; spend | `GET /api/p/agents/runs` (active runs), threads per surface |
| brain | `/brain` (Tabularium) | the shared Markdown memory; Setup/Settings configure per-agent read/write grants checked on every Brain MCP call (not an OS sandbox) | `GET /api/p/brain/access`; test allowed and denied MCP calls; the page lists notes |
| forge | `/forge` (Builds) | agents build plugins on a git branch; CAESAR runs checks, shows the diff, merges only after the operator approves | the Forge page: branch, checks, diff |
| missions | `/missions` (Campaigns) | one objective planned by Caesar into steps for the crew, run on Hermes' kanban, approved by the operator | the page: plan, steps, results |
| skills | `/skills` (Ludus) | every agent's skills and what the brain knows, as one tree, plus a cheat book | the tree; `caesar-skillset` explains how the set is chosen |
| tools | `/tools` (Armory) | the agents, CLIs and local models found on this machine and their sign-in state | the page; no secrets are read |
| news | `/news` (Watchtower) | feeds, new projects, a watch list | the page |
| scheduling | `/scheduling` (Chronicle) | Hermes cron jobs: when due, pause, resume, reschedule | `hermes cron list` agrees with the page |
| media | `/media` (Archive) | local images and videos, copy to the library, reversible Trash; the monolith showcase | `GET /api/p/media/index` |
| health | `/health` (Vitals) | machine, services, backups | `GET /api/health`, the page |
| hermes | `/hermes` (Herald) | configure the main operator: model, provider, sign-in, SOUL, doctor, oh-my-hermes panel | `hermes doctor`, `omh doctor` |
| library | `/library` (Bibliotheca) | the documents CAESAR was built from, on shelves; readable as Markdown | the page |
| notify | none | notification centre and phone push | the bell, push test in Settings |

## Operating rules
- Read the module's own `plugins/<id>/DESIGN.md` or `plugin.json` before changing it; changes go through `caesar-develop` (and `caesar-plugin` for a new one).
- Do not restart the service while an agent run is active (`GET /api/p/agents/runs` must be empty), and do not read `.env`, auth files or `SECRETS.md`.
- To change a module's look follow `caesar-design`; animations are switches declared in `themes/hexameter/theme.json` and listed in Settings.
- The studied systems the modules were modelled on are documented in `docs/systems/` (start with `SYSTEMS-OVERVIEW.md`); their sources are on the VPS in `~/reference`.
