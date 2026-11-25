---
name: caesar-model-providers
description: "Use when the operator wants to choose, change or check which model or provider an agent uses (Caesar, Claude Code, Codex, a crew member), asks why an agent is on a different model, or a chat fails because a model vanished. Also: 'jaki model ma the researcher', 'zmien model dla', 'dostawcy modeli', Settings > Model providers."
---

# Model providers (Settings > Model providers)

Each agent has a default model and effort, set in **Settings > Model providers** (the `providers` section of the settings page; plugin `agents`, file `plugins/agents/providers.ts`). A chat that picks its own model keeps it; the default applies only when the chat picked nothing.

## What you can do
- `GET /api/p/agents/providers` lists every agent (Caesar and the Hermes crew, Claude Code, Codex) with its runtime, the models it really offers, the chosen default, and a status: **ready**, **limited** (the CLI listed no models yet: not signed in, or still starting) or **gone** (the chosen model is no longer offered).
- `PUT /api/p/agents/providers/<agent>` with `{ "model": "...", "effort": "..." }` sets one or both; an empty string clears it. A model or effort the agent does not offer is refused with a plain message.

## Rules
1. **Gone is not broken.** If the chosen model vanished, the chat uses the agent's own default and Settings shows "Model gone". Tell the operator and offer a replacement from the list; do not guess one silently (2026-11-03: a model rename left threads on a dead model).
2. Hermes crew members share Hermes' model list (ids look like `provider:model`); Claude Code and Codex list their own. Pick from the list, never type an id by hand.
3. Changing a default changes only new chats. It does not edit a Hermes profile's config file.
4. Works the same on desktop and mobile; it is two plain selects per agent.
