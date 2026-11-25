---
name: caesar-hermes-marketplace
description: "Hermes Marketplace (Mercatus): the Hermes plugin catalog inside CAESAR, read only, plus Stop everything (Hermes' emergency pause). Use when asked to find a Hermes plugin, see what Hermes has installed, check what a plugin declares or whether updates wait, or to stop or resume everything Hermes does. Triggers: hermes plugin, marketplace, katalog pluginow, zainstalowane pluginy hermesa, capabilities, stop everything, pause hermes, zatrzymaj wszystko, wznow"
---

# Hermes Marketplace (Mercatus)

Pack `dev`, edition `owner`, plugin `plugins/hermes-marketplace/`. Spec: `docs/research/HERMES-NATIVE-2026-11-07.md`, rows 1 and 2 and the rules at the end. It manages **Hermes' own** plugin directory. A Hermes package is not a CAESAR plugin, and it runs with Hermes' authority, so the page says so on screen.

## What it does (all routes are the operator's)
| Route | What |
|---|---|
| `GET /status` | Hermes version (from `hermes --version`), the stop state, age of the catalog copy |
| `GET /catalog?q=&category=&tier=&limit=&offset=` | search the catalog copy on disk (`DATA/plugins/hermes-marketplace/catalog.json`). Every word must hit; official, then verified, then community |
| `POST /catalog/refresh` | `hermes plugins search "" --json` (about 1000 entries, 15 to 25 seconds); an empty answer keeps the old copy |
| `GET /installed[?fresh=1]` | `plugins list --json` plus `plugins check-updates --json`, joined with the catalog entry; cached for a minute |
| `GET /capabilities` | `hermes plugins capabilities`, Hermes' own text |
| `GET /estop`, `POST /estop/pause {reason?}`, `POST /estop/resume` | Stop everything |

## Stop everything
`hermes pause` writes `$HERMES_HOME/ESTOP`; `hermes resume` removes it. While it exists Hermes starts no cron job, no kanban task and no new gateway turn, **Caesar's own chat turns included**. Work already running finishes; nothing is killed. CAESAR calls the command with an argument array (the reason is one argument), then **reads the sentinel back**; if Hermes said yes but the file does not agree, the route answers 502 and says so. Each press is written to the evidence ledger (source `human`, ref the sentinel path).
The thin live bar at the bottom shows **Stop everything** (two taps: the first asks, the second pauses) and, while paused, **Hermes paused · Resume** (one tap).

## Rules this plugin keeps
- Argument arrays only, never a shell string. Fail closed when the CLI is missing (503) or the answer is not the JSON it should be (502).
- Hermes' version is on the page, because the commands move between releases. An entry that needs a newer Hermes is marked.
- Nothing installs, enables, updates or removes a Hermes plugin yet. When that comes (order step 4 of the spec) each action is an Activity item with a yes, installed disabled by default, read back with `list` after.
- A catalog entry is a description Hermes publishes, not proof the plugin is safe. Pinned commits are shown; the capabilities it asks for are shown before anything else.

## Not tested live on purpose
Tests use a stub that records the argument arrays (`tests/hermes-marketplace.test.ts`). The real `hermes pause` was never run while building it: it would hold Caesar's own turns.
