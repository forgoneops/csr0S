# Audit 1: old Caesar capabilities vs the new app (caesaros-proto)

Read-only audit. No repo file was edited. Date: 2026-11-23.

## Counts

- capabilities checked: 52
- PRESENT: 9
- PARTIAL: 29
- MISSING: 11
- OUT OF SCOPE: 3

## How I read the two sides

Old: every folder in <old-repo>/plugins/*/plugin.json (description and pages), 54 plugins; `companion/` and
`lenovo-node/` have no plugin.json and are not modules.

New: core/*.ts route files (the API that actually exists), web/atrium/ns.js (NSIA menu, lines 3-11), pages.js (PG demo
pages), hubs.js (workspace widgets), bridge.js (real chat, crew, approvals, terminal) and real.js (the real pages that
replace the prototype's demo ones). A page is called PRESENT only when its data comes from a core API and the actions
change that data. Demo pages: pages.js still holds Mail, Social, Media Gallery and Editor; ns.js Engines and Settings are
prototype shells. The Fleet menu entry exists but opens Devices, which is pairing, not client servers.

## Table

| Capability | Old plugin | What it did (one line) | Where it is in the new app (file:line) | Status | Importance | What is missing |
|---|---|---|---|---|---|---|
| Chat with agents and crew | agents | One resumable thread per agent: Hermes, Claude Code, Codex. | Chat: bridge.js:53 (real targets), bridge.js:215 (streamed turns); core/crew.ts:147 /api/chat-targets | PRESENT | high |  |
| Crew overview (The Lair) | agents | Who is working, waiting or idle; open a thread with each. | Crew page wired to live /api/crew: bridge.js:44-52, pages.js:16; crew widget hubs.js:40 | PRESENT | high | Runs/Cohors tabs are still prototype placeholders. |
| Approvals | notify, ledger | Agents ask for your yes; approve or deny. | bridge.js:244 /api/approvals/:id/decision; Notifications real.js:447 | PRESENT | high |  |
| Board | board | Sticky cards for the day with priority, reminder, linked to notes. | Board: real.js:168, /api/board todo/doing/done (core/board.ts) | PARTIAL | high | No priority, no reminder, no note link. |
| Calendar | calendar | Own .ics calendar: repeats, time zones, subscribe, import/export. | Schedule: real.js:192, /api/calendar (title/date/time only, core/calendar.ts) | PARTIAL | high | No repeat, no time zones, no .ics import/export or subscribed links. |
| Brain (shared markdown store) | brain | Shared Markdown brain with per-agent read/write access, proposals you accept. | Memory: real.js:282-325 /api/notes, tags, backlinks (core/notes.ts) | PARTIAL | high | Storage is real; per-agent access rules and proposal approval are absent. |
| Markdown editor | scriptorium | File tree, tabs, wikilinks, outline, backlinks, rename with link update, palette. | The Memory editor is real (real.js:282-325); the separate Editor page is demo (pages.js:32) | PARTIAL | high | No file tree, tabs, outline, command palette, or rename-with-link-update. |
| Library | library | Bookshelf of the documents CAESAR was built from, readable by people and machines. | Library: real.js:97, /api/knowledge (core/knowledge.ts) | PRESENT | medium |  |
| Folders | folders | Bundles of references to notes, photos, media and links; nothing copied. | Folders: real.js:530, /api/knowledge-folders (folder name on a library doc) | PARTIAL | medium | Only library documents can be filed; no notes, photos, media or links. |
| Lectio (read a link) | lectio | Reads a page/PDF/arXiv/video, summarises, translates, saves a note. | none; the Reading page is a plain to-read list (real.js:359-373), no /api/lectio | MISSING | medium |  |
| Meetings | meetings | Record mic and tab audio, transcribe locally, note with summary, decisions, action items. | Meetings: real.js:490, /api/transcribe (core/speech.ts) plus one agenda note per meeting | PARTIAL | high | No summary/decisions/action items, no second (tab) track, no action items as cards. |
| Speech-to-text engine | speech | Local faster-whisper used by dictation, meetings and voice mode. | core/speech.ts /api/transcribe, /api/transcribe/status; used by Meetings (real.js:495) | PRESENT | medium |  |
| Vox (dictation) | vox | Hold to talk into any field, fillers stripped, text at the cursor. | none | MISSING | medium |  |
| Mail | mail | Own IMAP client into a local searchable store. | none; Mail page is demo data (pages.js:22); no /api/mail | MISSING | high |  |
| Scheduled jobs | scheduling | Hermes cron jobs: see what is due, pause, reschedule, run. | none; Schedule page is the calendar only (real.js:192) | MISSING | medium |  |
| Watchers | watchers | Rules that watch a page/file/time/event without tokens and fire into Activity. | Watchers: real.js:507, three fixed rules (stale task, backup age, today's event) over /api/lists/watchers | PARTIAL | medium | Only three built-in rules; no page, file or CAESAR-event watchers. |
| Weather | weather | Open-Meteo current conditions, hourly and 7-day outlook. | Weather: real.js:644, core/weather.ts current plus 3 days | PARTIAL | low | No hourly, 3 days instead of 7, no saved places. |
| News | news | HN, Lobsters, arXiv, channels, Bluesky/Mastodon, RSS; digest written by Varro. | News: real.js:652, RSS/Atom feeds only (/api/news) | PARTIAL | medium | No preset sources and no digest; you add raw feed URLs. |
| Goals | goals | Goal cards for today, week, month, quarter; carry unfinished forward. | Goals: real.js:359, flat checklist (/api/lists/goals) | PARTIAL | medium | No horizons, no carry-forward, no history of finished work. |
| Ideas | ideas | Cards in lanes Inbox/Now/Next/Waiting/Parked/Done with WIP limits. | Ideas: real.js:362, flat checklist with To Board | PARTIAL | medium | No lanes, no ordering, no WIP limits. |
| Missions | missions | One objective planned by Caesar into steps on the kanban; approve plan and result. | Missions: real.js:551, mission with manual steps and a progress bar (/api/lists/missions) | PARTIAL | high | You write the steps; no Caesar planning, no kanban run, no result acceptance into the Brain. |
| Forge | forge | Agents build on their own branch; CAESAR checks, shows the diff, merges on your yes. | Builds: real.js:612, a manual record list (planned/building/passed/failed) | PARTIAL | medium | No branch, no checks, no diff, no merge. |
| Praetorium (command post) | praetorium | Live scene of the troop plus read-only admin of machine, jobs, sites, backups. | none; the Command page is a prompt shelf (real.js:573) | MISSING | medium |  |
| Horde desk (Herdr) | herdr | Watch and instruct agents running in Herdr; answer their prompts. | Horde desk: real.js:595, crew plus latest tool calls plus Stop everything (/api/crew, /api/recent-tools, /api/running/stop) | PARTIAL | medium | No instruction, no prompt answering; it is a status view. |
| Business and Finance | business, finance | Business state page and private money snapshots, manual or CSV, operator-only. | Business: real.js:612, income/expense ledger (/api/lists/business) | PARTIAL | medium | Only a manual ledger: no Overview/Progress/Reach, no CSV import, no agent denial. |
| Evidence | ledger | What CAESAR actually observed; goals close only against it. | Evidence: real.js:612, manual log (/api/lists/evidence) | PARTIAL | medium | Manual notes, not observed events. |
| Usage and cost | rations | Tokens per day and model, subscription value, Claude plan windows. | Usage real.js:262 and Cost real.js:432 over /api/usage (answers per engine) | PARTIAL | medium | Counts answers, not tokens or money; no plan windows. |
| Health and Annona | health, annona | Machine health, services, processes, backups; daily disk watch and cleanup proposals. | Health: real.js:421 (/api/hardware, /api/detect, /api/engines, /api/running); backup only as a widget (hubs.js:46, /api/backup) | PARTIAL | medium | No history, no daily measurement, no growth tracking, no cleanup proposals, no services list. |
| Fleet | fleet | Watch client servers over SSH: reachable, disk, memory, version. | none; the Fleet entry opens Devices, which is pairing (real.js:471) | MISSING | medium | The menu entry exists but shows a different thing. |
| Hermes configuration | hermes | Model, provider, reasoning, sign-in, profiles, SOUL, doctor via the hermes CLI. | none | MISSING | high |  |
| Marketplace and Training Grounds | hermes-marketplace, training | Hermes plugin catalog, update status, install and remove skills on your yes. | Marketplace: real.js:269, read-only scan of ~/.hermes/skills (/api/skills, core/skills.ts) | PARTIAL | medium | Scan only: no catalog, no update status, no install or remove. |
| Speculum (Hermes mirror) | hermes-mirror | Curator state, kanban, learning journey, read only. | Mirror: real.js:630 (/api/mirror, /api/mirror/kanban, /api/mirror/curator) | PARTIAL | low | Curator and kanban are real; no learning journey over time. |
| Skills tree | skills | Every agent's skills and what the Brain knows as one tree, plus commands. | Skills: real.js:470 points at the Marketplace scan | PARTIAL | medium | One flat list of skills found on disk; no per-agent tree, no cheat book. |
| Tools detection | tools | Finds agents, CLIs and local models and whether they are signed in. | Integrations real.js:477 (/api/detect), Health real.js:421, Models real.js:61 | PRESENT | medium |  |
| Connectors (MCP) | connectors | See each coding tool's MCP servers, plug one in or out with its command on your yes. | Integrations: real.js:477 lists model servers, gateways, paired devices and skills | PARTIAL | medium | No MCP server list per tool, no enable/disable. |
| Image Studio | studio | Local ComfyUI: prompt, size, one job at a time, pictures kept with prompt. | Image Studio: real.js:663, /api/image (core/imagegen.ts) | PRESENT | medium | Shows 'not ready' when ComfyUI is absent. |
| Reels | reels | Gated pipeline: direction, script, materials, takes, measured review. | Reels: real.js:612, a stage tracker (direction to delivered) | PARTIAL | low | Only the tracker; no direction candidates, script, takes or review. |
| Media gallery | media | Browse local images and videos, copy to the library, reversible trash. | none; Media Gallery page is demo art (pages.js:31) | MISSING | medium |  |
| Offer Boards | offer-boards | Compose offer boards from photos in the browser and export PNG. | Offer Boards: real.js:612 is an offer list (title, price); no composer or export | OUT OF SCOPE | low | Promo content: the capability is out of scope for this audit. |
| Social (Agora) | social | Signal to brief to draft pipeline with roles and rules. | Social: demo page (pages.js:18) | OUT OF SCOPE | low | Posting and content work, out of scope for this audit. |
| Leads (Venatio) | venatio | Search per trade and town, scout, score, proposal drafts. | Leads: real.js:612, manual pipeline New/Contacted/Talking/Won/Lost | PARTIAL | low | No search, no scout, no scoring. |
| Jev | jev | Opt-in decision service. | none | MISSING | low |  |
| Claude bridge | claude-bridge | Two Claude Code accounts with failover at the usage limit. | none; chat targets list a single 'claude' (core/detect.ts:40, core/crew.ts:139) | MISSING | medium |  |
| Codegraph | codegraph | Static map of CAESAR's source: imports, exports, what to read, which tests. | none; Tool graph is call statistics, a different thing (real.js:583) | MISSING | medium |  |
| Web tools (Canon) | webtools | Design systems as Markdown the agents read; sites and design search. | Web tools: real.js:612, design entries with rules and status | PARTIAL | low | Entries are real text; no Canon rendering, no sites, no design search. |
| Terminal | terminal | A tmux shell as you, no PIN, not for agents. | Terminal: bridge.js:149-191 (xterm), /api/terminal/ws (core/terminal.ts) | PRESENT | high |  |
| Tool-call graph | toolgraph | Calls, latency and errors per tool, hottest path in crew runs. | Tool graph: real.js:583, /api/toolstats (core/usage.ts) | PRESENT | medium |  |
| Updates | updates | Release channel check, Polish changelog, apply after backup and signature, one tap back. | Updates: real.js:437 shows versions only; nothing checks or installs | PARTIAL | medium | No channel, no changelog, no apply, no rollback. |
| Notifications | notify | Notification centre and phone push, each source on or off. | Notifications: real.js:447 from approvals, handoff, failures, calendar, backup age, stale tasks | PARTIAL | high | No phone push, no per-source switches, no failure history. |
| Dream (nightly and brief) | dream | Nightly health check, 07:30 morning brief, daily review of recent work. | Daily review: real.js:398 builds today from this device and saves it as a note | PARTIAL | medium | No nightly run, no morning brief; you press refresh. |
| Grill (Quaestio) | grill | Short per-role interviews; answers become a card the agents read first. | Grill me: real.js:542, Caesar asks questions in a chat thread | PARTIAL | medium | No per-role interviews, no saved card in the vault, no gating on materials. |
| Companion and Lenovo node | companion, lenovo-node | Qt desktop client; MCP bridge to the Lenovo node. | not modules: no plugin.json; the face is web/atrium | OUT OF SCOPE | low | Not audited: owner-side client and hardware bridge. |

## The five things that hurt daily work most

1. Mail is gone: the page is demo data and there is no /api/mail.
2. Hermes itself cannot be configured from the new app (model, provider, sign-in, SOUL, doctor).
3. The calendar cannot repeat events, keep time zones or import/export .ics.
4. Missions do not plan: Caesar does not turn an objective into steps, and nothing runs on the crew kanban.
5. Meetings transcribe audio but do not produce summary, decisions or action items.

## What is better than before

Chat, approvals, the terminal, the tool graph, tools detection, the library and the image studio are real, on live
data, in the new shell. The Models and Devices pages are new and real.
