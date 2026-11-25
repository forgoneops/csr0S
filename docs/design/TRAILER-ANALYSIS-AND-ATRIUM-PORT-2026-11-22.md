# Trailer v4 analysed frame by frame, and what the new shell still owes it (2026-11-22)

Source: `~/Downloads/caesar-promo-v4/caesar-v4-main-1080p.mp4`, 91.3 s, 1 frame per second, 91 frames read as 8 contact sheets. Konrad's rule (2026-11-22): the base is OGAD and OGAM behaviour, and the CAESAR functions the trailer shows are integrated INTO it, nothing dropped. The trailer shows the real product (the Atrium), not a sketch.

## Timeline (second -> what is on screen)

| s | Scene | What it shows |
|---|---|---|
| 0-13 | Particle portrait | Caesar assembles out of purple halftone particles on black (WebGL), crystal glowing last |
| 14-17 | 01 CAESAR OS . EVOLVE | Dashboard: workspace tab strip across the top (Main, Daily, Content Studio, Web Studio, Knowledge, Team Ops, Server...), holo rail with crew portrait squares, a one-line tip bar, bottom ticker (STOP EVERYTHING, TERMINAL, SESSIONS, status words) |
| 18-23 | Home | Hero "GOOD EVENING. OPERATOR." over the throne art, "WHAT NOW?" with REVIEW items, "MAIN" workspace with Calendar and Board widgets, Edit layout |
| 24-35 | 02 YOURS . TUUS | Settings as grouped cards (Setup and health, Engines, Brain and memory, Computer use, What Caesar learned, Backup and restore, Look and motion); palette chips cycle the whole UI on the beat |
| 41-48 | 03 PLATFORMS | Desktop window, web app, PWA ("Linux desktop app in the works, web app now, PWA now, native mobile later") |
| 49-57 | 04 DEVICES . FASTI | Devices page: pairing, "visible to nearby", restore from VPS, a task started on the phone lands on the PC |
| 58-67 | 05 MOBILE . VITA | The same shell on a phone: hero, What now, Caesar chat with an approval card (APPROVE, NOT NOW), ticker, bottom bar |
| 68-80 | 06 MARKETPLACE . MERCATUS | Add apps: App packs, community, Hermes skills and plugins "scanned first, installed on your yes" |
| 81-88 | 07 HERMES . NUNTIUS | One shell: Home plus Caesar chat plus terminal plus Board in split panes; approval card inside the chat |
| 89 | Close | "Roman soul. Cyberpunk world." then the particle portrait again |

## What the new shell has and lacks against this

| Trailer element | New shell today | Owner |
|---|---|---|
| Particle portrait intro and outro | no (static splash at best) | claude-a, next |
| Hero over throne art, "What now?", workspaces with widgets, Edit layout | **built now** (`17fa6e5`): Home with hero, What now, workspace tabs, 6 built-in widgets, move and remove buttons | claude-a, deepen |
| Workspace tab strip across the top, tabs on demand | in Home only; no top strip, no free-mode windows | claude-a |
| Bottom ticker / live bar with STOP EVERYTHING, TERMINAL, SESSIONS | status chips only (R54 live-bar item); no ticker, no stop-all | claude-a |
| Rail with crew portrait squares and status | rail has icons only; crew is owner-layer | needs crew module |
| Settings as grouped cards incl. Look and motion palette chips | sections exist; palettes exist; no live cycling | claude-b, later |
| Devices: pairing, nearby, restore from VPS, task handoff phone to PC | add gateway and check only | claude-a (S5, N4) |
| Phone: hero, What now, Caesar chat with approve | chat, approvals cards (B, in progress); phone Home built; no status sheet | claude-b |
| Marketplace: Hermes skills and plugins, scan first, install on yes | not built (Modules list only) | crew, owner layer |
| Chat + terminal + Board in split panes | chat and terminal pane exist; Board is an owner module, no split | claude-b, claude-a |
| Palette cycling on the beat | no | later, small |
| Page banners per area (throne, forge, archive, command, system) | **built now**, five strips in the Neo Roma pack, no text on art | done |

## Order from here (desktop first)

1. Home depth: crew widget slot, Board and Calendar slots as module widgets (R54 panes), notifications.
2. Ticker with a real Stop everything (stops running engine turns and the terminal's job), Sessions list.
3. Particle intro and outro with Motion Full/Off.
4. Devices: pairing code and QR, visible to nearby, task handoff.
5. Marketplace page fed by Hermes skills and plugins, scan before install.
6. Split panes: chat, terminal, Board.

Not verified: this was read from frames only; the exact widget lists of the trailer's Calendar and Board were not legible at 480 px.
