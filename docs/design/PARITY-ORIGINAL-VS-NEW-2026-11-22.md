# Parity: original (cockpit, Atrium) vs new shell (2026-11-22)

Rule from Konrad 2026-11-22: nothing from the original is cut; the new shell only improves it. Source of the original list: `plugins/*/plugin.json` nav entries in `~/apps/cockpit` (52 plugins, 42 nav entries, 16 widgets). New shell: `shell/integrate-m2` `c3d7d0e`, core pages in `web/src/pages` plus `terminal`.

**Result: 2 of 42 original sections exist in the new shell. 40 do not yet.** None is dropped by decision; the register (R16, R34) keeps them, but no build step ports them yet. They belong to the owner layer (`owner/`, empty today) per R45, so each needs its own step and a screenshot at 390 and 1440.

| Original plugin | Route | Label | New shell |
|---|---|---|---|
| agents | /chat | Chat | web/src/pages/Chat.tsx (S3) |
| agents | /lair | Horde | not ported yet |
| agents | /usage | Usage | not ported yet |
| board | /board | Board | not ported yet |
| brain | /brain | Memory | not ported yet |
| business | /business | Business | not ported yet |
| dream | /dream | Daily review | not ported yet |
| fleet | /fleet | Fleet | not ported yet |
| folders | /folders | Folders | not ported yet |
| forge | /forge | Builds | not ported yet |
| goals | /goals | Goals | not ported yet |
| grill | /grill | Grill me | not ported yet |
| health | /health | Health | not ported yet |
| herdr | /herdr | Horde desk | not ported yet |
| hermes-marketplace | /hermes-marketplace | Hermes Marketplace | not ported yet |
| hermes-mirror | /hermes-mirror | Hermes Mirror | not ported yet |
| ideas | /ideas | Ideas | not ported yet |
| lectio | /lectio | Reading | not ported yet |
| ledger | /evidence | Evidence | not ported yet |
| library | /library | Library | not ported yet |
| mail | /mail | Mail | not ported yet |
| media | /media | Media Gallery | not ported yet |
| meetings | /meetings | Meetings | not ported yet |
| missions | /missions | Missions | not ported yet |
| news | /news | News | not ported yet |
| offer-boards | /offer-boards | Offer Boards | not ported yet |
| praetorium | /praetorium | Command | not ported yet |
| rations | /rations | Cost | not ported yet |
| reels | /reels | Reels | not ported yet |
| scheduling | /scheduling | Schedule | not ported yet |
| scriptorium | /scriptorium | Editor | not ported yet |
| skills | /skills | Skills | not ported yet |
| social | /social | Social | not ported yet |
| studio | /studio | Image Studio | not ported yet |
| terminal | /terminal | Terminal | web/src/terminal (S4) |
| toolgraph | /toolgraph | Tool graph | not ported yet |
| tools | /tools | Tools | not ported yet |
| updates | /updates | Updates | not ported yet |
| venatio | /venatio | Leads | not ported yet |
| watchers | /watchers | Watchers | not ported yet |
| weather | /weather | Weather | not ported yet |
| webtools | /webtools | Web tools | not ported yet |

## Chrome of the original (from SHELL-FEATURE-MATRIX, M0.1)

Workspaces and tabs, hero, What now, widgets (Move, Edit layout), live bar, free-mode windows, dock, boot splash, ticker, Ctrl K, phone Status sheet, motion switch, voice. The new shell has: rail, flyouts, command palette (R54), live-bar item, pack pickers (R56). Workspaces, widgets, free mode, dock and hero are **not** in the new shell yet (R34 open).

## Not verified

Mobile of the original was not re-captured in this pass; mobile of the new shell was captured at 390x844 on 5 routes (R56). Row-level behaviour of the original (matrix A1..) was not re-tested.
