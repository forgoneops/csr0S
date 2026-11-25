# Full audit: Off Grid Desktop + Caesar's tools, against CaesarOS today

Author: claude-b, 2026-11-22. Requested by Konrad. Supersedes the shorter `AUDIT-VS-OFFGRID-PRO-2026-11-22.md`.

**The principle (Konrad's words, 2026-11-22):** Off Grid AI Desktop and its idea are the shell. Everything in it must exist in CaesarOS, nothing less. Caesar's own tools are then wired into that one shell and expand it. So the audit has three parts: A, everything Off Grid Desktop does (base and Pro), the floor; B, every Caesar tool and where it plugs into that frame; C, what to do, in order.

**Basis.** Part A: the Off Grid reverse-engineering notes (`docs/reference/OGAD-RE-PASS1..14`, `OGAD-PRO-ANALYSIS`, `OGAD-PRO-BUNDLE-SPEC`, the function inventory) and my earlier parity matrix. Part B: the 49 plugin manifests in the Caesar cockpit repo (`plugins/*/plugin.json`). CaesarOS side: read from code on branch `shell/proto-port` (core files, API routes, pages), not by walking every screen. Statuses: **have** works and was seen at some point; **part** exists and is narrower; **no** nothing in the app; **cut** a deliberate decision. "Not checked" is written where I did not verify it.

## Part A. Off Grid Desktop, every function, against CaesarOS

### A1. Frame and first run
| # | Off Grid function | CaesarOS | Status | Gap |
|---|---|---|---|---|
| A1 | Sidebar with groups that collapse, never reflow | slim rail, Apps flyout, Atrium rail with crew | part | groups do not show the active child |
| A2 | Command palette: screens and results | screens and module commands | part | no results from notes, chats, documents |
| A3 | App Back and Forward | buttons, edge swipe | have | none |
| A4 | One shortcut sheet with a drift test | none on this branch | no | keymap exists only on the unmerged R37 branch |
| A5 | Settings in addressable sections | `/settings/<section>`, 7 sections | have | none |
| A6 | Locked entries visible with a reason | palette, flyout, drawer | have | no module is locked today |
| A7 | "What it does for you" guide | none | no | add a Guide screen |
| A8 | About, licences, credits | version only | part | add licences and credits to Off Grid |
| A9 | Six-step first run, step saved, resumable | stepper with 9 steps | have | not re-run since the last change |
| A10 | Hardware read and three tiers (quick, balanced, max) | `/api/hardware`, Start | part | tier presentation not checked |
| A11 | Intro slides, skippable | particle intro (Caesar assembles) | part | different on purpose, no slides |
| A12 | Get Started checklist from real state | none | no | add as a panel |
| A13 | Analytics consent with "what we share" | privacy page, no telemetry | part | no consent step needed while nothing is sent |
| A14 | Report a problem | page, reviewed before sending | have | none |
| A15 | Lock screen and passphrase | none | cut | no PIN anywhere (decision 2026-11-17) |

### A2. Chat
| # | Off Grid function | CaesarOS | Status | Gap |
|---|---|---|---|---|
| A16 | Streaming chat, markdown, copy, stop | yes, with tables and nested lists | have | none |
| A17 | Rename, delete conversation | yes | have | none |
| A18 | Conversation list: search, groups, pins | search by title | part | no date groups, no pins |
| A19 | Model picker with capability icons | select of models | part | no engine menu, no capability icons (not built) |
| A20 | Thinking block | yes, folded | have | needs an engine that sends reasoning |
| A21 | Tool rows | yes, one per call | have | no engine reports calls yet |
| A22 | Approval dock and cards bound to the chat | yes, APPROVE / NOT NOW, record | have | nothing asks yet |
| A23 | Attachments, preview | images and text files, limits | part | no PDF or Office |
| A24 | Vision in chat | image sent to engines that take it | part | model dependent |
| A25 | Voice in chat: dictation, spoken replies | none | no | needs local speech |
| A26 | Message queue while generating | none | no | add |
| A27 | Context compaction with a visible budget | none | no | add meter and summary |
| A28 | Image generation in chat | none | no | needs a local image engine |
| A29 | Export, share a conversation | none | no | export to Notes |
| A30 | Skills and slash commands | none in chat | no | slash menu from skills |
| A31 | Use my knowledge, sources shown | yes | have | keyword only |

### A3. Models, engines, gateway, devices
| # | Off Grid function | CaesarOS | Status | Gap |
|---|---|---|---|---|
| A32 | Model catalogue, fit tier, search | `/api/models/installed`, Models page | part | catalogue and fit not checked |
| A33 | Safe downloader: queue, resume, checksum | `/api/models/pull` | part | resume and checksum not checked |
| A34 | Load policy, load anyway | none | no | needs a local engine of our own |
| A35 | Per-model settings | none | no | add |
| A36 | Add an OpenAI-compatible server, key kept local | yes | have | none |
| A37 | Engine updates, staged trial | none | no | later |
| A38 | Storage screen | none | no | add |
| A39 | Device info | hardware read | part | no page |
| A40 | Local gateway API (OpenAI-compatible), keys | `gateway-api`, keys page | have | loopback only, by design |
| A41 | Devices list, route in use | this device, add gateway, pairing | part | route not shown |
| A42 | Pair a phone, direct link | pairing code, paired list, join | part | pairing only |
| A43 | Sync chats and settings across devices | none | no | the real Devices gap |
| A44 | Backup and restore | yes | have | none |
| A45 | Software update | none | no | check only, apply on tap |

### A4. Knowledge, notes, projects
| # | Off Grid function | CaesarOS | Status | Gap |
|---|---|---|---|---|
| A46 | Notes: files you own, revisions, trash | yes, with tags and backlinks | have | no open-vault-in-place |
| A47 | Knowledge base: add, search, rebuild notice | add and keyword search | part | no embeddings |
| A48 | Projects: prompt, files, chats | yes | have | none |
| A49 | Unified search over everything | none | no | the top gap |
| A50 | Semantic memory | none | no | needs local embeddings |

### A5. Integrations, actions, system access
| # | Off Grid function | CaesarOS | Status | Gap |
|---|---|---|---|---|
| A51 | Connectors catalogue, secrets form | none | no | add |
| A52 | MCP servers | none in the app | no | Hermes has them, no page |
| A53 | Actions: draft then approve, action record | approvals and record | part | nothing proposes actions |
| A54 | Tasks: active runs in one place | live bar, Sessions, Stop | part | this core's chat turns only |
| A55 | Computer use with steps and retry | none | no | its own plan |
| A56 | Permissions panel | none | no | add |
| A57 | Gallery, image and video studio | none | no | needs a local image engine |
| A58 | Explore (presets, comic reader) | none | no | niche, later |

### A6. Pro features
| # | Off Grid Pro function | CaesarOS | Status | Gap |
|---|---|---|---|---|
| A59 | God (voice assistant, wake word, acts) | crew chat, approvals; no voice | part | voice and computer use |
| A60 | Day: morning brief | none | no | a crew action |
| A61 | Reflect | none | no | needs activity capture |
| A62 | Replay | none | no | heavy, owner-only, far later |
| A63 | Meetings: record, transcribe, note | none | no | needs local transcription |
| A64 | Entities and relationship graph | notes backlinks only | no | curator builds, you accept |
| A65 | Notifications | counter and cards | part | no system or phone push |
| A66 | Voice and dictation at the cursor | none | no | Wayland untested |
| A67 | Scribe | none | no | needs a small local model |
| A68 | Clipboard history | none | no | local only |
| A69 | Vault (passwords) | none | cut | CAESAR does not hold secrets |
| A70 | Video from a sentence | none | cut | not needed |
| A71 | Devices sync | see A43 | no | |

**Part A count:** 71 rows (A71 repeats A43): have 16, part 20, no 32, cut 3 (A15, A69, A70). The 52 rows that are part or no are the floor still to build (51 without the repeat).

## Part B. Caesar's 49 tools, wired into the Off Grid frame

"Frame slot" is where the tool goes in the Off Grid-style navigation. All of them live in the owner layer (not in the consumer core) and plug in through the module mechanism. **Only three of them exist in the new app**, except where noted.

| Caesar tool | What it does | Frame slot | In CaesarOS |
|---|---|---|---|
| Agents | chat with Hermes, Claude, Codex | Chat | **have**: all 8 Hermes crew members answer (engines `hermes:<profile>`) |
| Hermes | configure Hermes, profiles, SOUL | System | part: crew listed, no configuration |
| Terminal | shell, kept alive | pane | **have** |
| Tools | detect agents, CLIs, models | System | **have** (first run, Settings) |
| Brain | shared Markdown brain, per-agent access | Private data | part: notes and knowledge, no per-agent access |
| Scriptorium | Markdown workspace on the vault | Private data | part: Notes |
| Folders | bundles of references | Private data | no |
| Library | the documents Caesar was built from | Discover | no |
| Lectio | read a link, page, PDF, video | Discover | no |
| Media Gallery | local images and video, trash | Private data | no |
| Studio | local image studio (ComfyUI) | Make | no |
| Reels | short video pipeline | Make | no |
| Vox | dictation | pane | no |
| Speech | voice to text on this machine | System | no |
| Commentarii (Meetings) | record, transcribe, note | Work | no |
| Mail | own mail client over IMAP | Day | no |
| Calendar | own calendar, .ics | Day | no |
| Scheduling | Hermes scheduled jobs | Day | no |
| Board | sticky notes for the day | Day | no (a Home widget slot exists) |
| Goals | today, week, month, quarter | Day | no |
| Ideas | the plan as cards in lanes | Work | no |
| Dream | nightly health check, morning brief | Day | no |
| Weather | forecast, no key | Day | no |
| Missions | one objective planned into steps | Work | no |
| Forge | agents build plugins on a branch | Work | no |
| Praetorium | command post | Work | no |
| Herdr (Horde desk) | watch the agents in Herdr | Work | part: crew status only |
| Fleet | watch client servers | System | no |
| Health | machine health | System | part: hardware read |
| Annona | disk guard | System | no |
| Rations (Computus) | cost of agents and subscriptions | System | no |
| Finance | money snapshots | Work | no |
| Business | one page for the business | Work | no |
| Notify | notification centre and phone push | System | part: counter |
| Updates | keep CAESAR current | System | no |
| Connectors | MCP servers per coding tool | System | no |
| Hermes Marketplace (Mercatus) | the plugin catalogue | System | no |
| Hermes Mirror (Speculum) | what Hermes keeps itself | System | no |
| Training Grounds | Hermes skill registry | System | no |
| Skill tree | everything the troop can do | System | no |
| Toolgraph | calls, latency, errors per tool | System | no |
| Codegraph | map of the source | System | no |
| Claude Bridge | two Claude accounts, failover | System | no |
| Jev | decision service | System | no |
| Watchers | rules that watch without tokens | Work | no |
| News | calm news, feeds | Discover | no |
| Social (Agora) | social desk | Work | no |
| Venatio | leads for a web studio | Work | no |
| Web tools | design systems for agents | Make | no |
| Offer Boards | real-estate offer boards | Make | no |
| Quaestio (Grill me) | interviews per role | Talk | no |
| Evidence (Ledger) | what Caesar observed | Work | no |
| Companion, Lenovo node, Vita, Hermes bridge parts | device and companion helpers | System | not checked |

**Part B count:** 53 rows covering the 49 manifests (a few tools are listed under more than one name): have 3 (Agents, Terminal, Tools), part 6, no 43, one row not checked.

## Part C. What to do, in this order

1. **The face.** The Atrium (your approved prototype) becomes the shell, with the new icons and controls. Crew and real chat are wired in; the pick-a-crew-member step is being fixed now.
2. **Close the floor from Part A**, the 52 part/no rows, grouped: (a) frame: shortcut sheet, guide, checklist, about; (b) chat: model menu with capability icons, queue, compaction, export, slash commands; (c) models and system: storage, per-model settings, updates, permissions; (d) search: unified search, then semantic memory; (e) devices: the sync; (f) connectors and MCP.
3. **Wire the Caesar tools into the frame**, in the order you use them: Board, Calendar, Mail, Goals and Ideas (Day); Brain and Scriptorium merged into Notes; Meetings and Vox once speech exists; Connectors, Marketplace and Skills together; then Fleet, Health, Rations, Annona; the rest last. Each as a module on the existing mechanism, so the consumer build never gets them.
4. **Bigger plans of their own:** computer use, meetings with local transcription, voice.

## Not verified
- The CaesarOS side is read from routes, pages and files, not from walking each screen today. Rows marked "not checked" need a pass.
- Caesar's tool descriptions are from their manifests, not from running each tool.
- The prototype wiring is in progress and not counted as done.
