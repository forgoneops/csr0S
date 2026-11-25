# Atrium: which menu pages are real and which are still demo (2026-11-22, automatic)

Method: every menu entry is opened in Chromium at 1440x900 and 390x844 (touch). A page counts as **real** when opening it makes the browser call a core endpoint of its own (beyond the background polling every page shares); **demo** when it only draws the prototype's invented content. Page errors and horizontal overflow are recorded for each.

| Page | Status | Core endpoints it calls | 1440 overflow | 390 overflow | page errors |
|---|---|---|---|---|---|
| Chat | demo | - | 0 | 0 | none |
| Crew | demo | - | 0 | 0 | none |
| Grill me | demo | - | 0 | 0 | none |
| Social | demo | - | 0 | 0 | none |
| Board | real | /api/board | 0 | 0 | none |
| Daily review | real | /api/calendar, /api/board, /api/notes, /api/usage, /api/lists/goals | 0 | 0 | none |
| Goals | real | /api/lists/goals | 0 | 0 | none |
| Mail | demo | - | 0 | 0 | none |
| Schedule | real | /api/calendar | 0 | 0 | none |
| Watchers | real | /api/lists/watchers | 0 | 0 | none |
| Weather | demo | - | 0 | 0 | none |
| Memory | real | /api/notes, /api/notes/tags | 0 | 0 | none |
| Search | demo | - | 0 | 0 | none |
| Meetings | real | /api/notes | 0 | 0 | none |
| Folders | real | /api/knowledge-folders, /api/knowledge | 0 | 0 | none |
| Reading | real | /api/lists/reading | 0 | 0 | none |
| Library | real | /api/knowledge | 0 | 0 | none |
| Media Gallery | real | /api/notes, /api/knowledge, /api/backup, /api/hardware, /api/running | 0 | 0 | none |
| Editor | real | /api/notes, /api/knowledge, /api/backup, /api/hardware, /api/running | 0 | 0 | none |
| News | demo | - | 0 | 0 | none |
| Computer | real | /api/computer/state, /api/computer/audit | 0 | 0 | none |
| Missions | real | /api/lists/missions | 0 | 0 | none |
| Builds | real | /api/lists/builds | 0 | 0 | none |
| Horde desk | real | /api/running, /api/recent-tools | 0 | 0 | none |
| Command | real | /api/lists/prompts | 0 | 0 | none |
| Business | real | /api/lists/business | 0 | 0 | none |
| Evidence | real | /api/lists/evidence | 0 | 0 | none |
| Ideas | real | /api/lists/ideas | 0 | 0 | none |
| Tool graph | real | /api/toolstats | 0 | 0 | none |
| Image Studio | demo | - | 0 | 0 | none |
| Reels | demo | - | 0 | 0 | none |
| Web tools | demo | - | 0 | 0 | none |
| Offer Boards | real | /api/lists/offers | 0 | 0 | none |
| Leads | real | /api/lists/leads | 0 | 0 | none |
| Mirror | real | /api/mirror | 0 | 0 | none |
| Vault | real | /api/vault | 0 | 0 | none |
| Clipboard | real | /api/lists/clipboard | 0 | 0 | none |
| Devices | real | /api/pairing, /api/backup, /api/notes, /api/handoff, /api/sync/state | 0 | 0 | none |
| Integrations | real | /api/detect, /api/model-servers, /api/gateways, /api/pairing, /api/skills, /api/settings, /api/notes, /api/knowledge, /api/backup, /api/hardware, /api/running | 0 | 0 | none |
| Models | real | /api/hardware, /api/models/installed, /api/models/pull, /api/engines, /api/notes, /api/knowledge, /api/backup, /api/running | 0 | 0 | none |
| Engines | demo | - | 0 | 0 | none |
| Gateway | real | /api/tokens | 0 | 0 | none |
| Marketplace | real | /api/skills | 0 | 0 | none |
| Usage | real | /api/usage | 0 | 0 | none |
| Cost | demo | - | 0 | 0 | none |
| Fleet | demo | - | 0 | 0 | none |
| Health | real | /api/hardware, /api/detect, /api/engines, /api/version, /api/running | 0 | 0 | none |
| Skills | demo | - | 0 | 0 | none |
| Terminal | demo | - | 0 | 0 | none |
| Notifications | real | /api/handoff, /api/failures, /api/calendar, /api/backup, /api/board | 0 | 0 | none |
| Updates | demo | - | 0 | 0 | none |

**34 of 51 menu pages are real; 17 are demo.**

Caveat: this detects that a page talks to the core, not that every control on it works. Each real page was exercised by hand or by a browser script when it was built.

Not verified: a real iPhone, the installed PWA, typing inside the Tauri window.


## Update 2026-11-23 (claude-a)

48 of 51 menu pages are real. Made real since the table above: Tool graph and Horde desk (live tool calls via Hermes stream-json), Evidence, Leads, Offer Boards, Builds, Business, Web tools, Reels (local record lists), Mirror (profiles, curator, kanban, read only), Weather (typed city, Open-Meteo, only on Look up), News (own RSS/Atom feeds, public hosts only).

Still demo, and why:
- Mail, Social: need the owner's accounts and credentials.
- Image Studio: needs a local image model (none installed).

Not built: chat and settings sync (owner decision), voice and meeting transcription (no local speech model), real iPhone and installed-PWA test, typing inside the Tauri window (needs foreground).
