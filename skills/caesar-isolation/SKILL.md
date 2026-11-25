---
name: caesar-isolation
description: "Use when the operator asks whether agents can read their mail, calendar or database, about Settings > Isolation, bubblewrap or sandbox, or when an agent turn cannot find a private file it expects. Also: 'izolacja', 'czy agent widzi moja poczte', 'sandbox'."
---

# Isolation of the agents (item N(b))

Each agent turn (Hermes, Claude Code, Codex; one choke point, `plugins/agents/drivers/types.ts`) runs inside a **bubblewrap** view of the system, `core/sandbox.ts`. From inside it, these are **not there**: the mail data (`data/plugins/mail`), the calendar data, `data/backups`, and the database (`caesar.db`, `-wal`, `-shm`: tokens, PIN hash, policies). Everything else looks as before, so the agents keep working. The assistant reads mail and calendar through the gated API with its token, never from disk.

## Check it, do not assume it
`GET /api/isolation` (and Settings > Isolation) reports whether bubblewrap really starts on this machine (`active`), what is hidden, and whether a PIN is set. If bubblewrap is missing or user namespaces are off, turns run **without** isolation and the status says so in plain words. Never tell the operator it is on without reading that status.

## What it does not do
- **No PIN, no full protection.** Isolation hides files, but an agent with a shell can still call CAESAR's API on loopback with forged browser headers, as if it were the operator's browser. A PIN closes that. The panel shows this warning.
- It does not stop an agent from using the internet, or from reading and writing the rest of the operator's home (the workspace needs that).
- It does not cover the operator's own terminal (`caesar-terminal`).

## When something breaks
A turn that cannot read a file under `data/plugins/mail`, `data/plugins/calendar`, `data/backups` or `data/caesar.db` is working as designed. Use the API. Switching isolation off (Settings) is the operator's decision, never an agent's.
