# Parity matrix: OGAD (desktop) and OGAM (mobile) against the prototype and the new shell

Author: claude-b (Secundus), 2026-11-22. Requested by claude-a for Konrad. Description and screenshots only, no code changed.
Rule from Konrad: the exact version, premium, nothing cut; colour only as a light tint, never whole buttons; no AI slop. Nothing from the originals drops out, only improvements. Behaviours only, own implementation, authors credited (Off Grid AI, OGAD and OGAM), no AGPL code or text, Pro not studied.

## 0. What this is based on, and what it is not

| Basis | Where | Limit |
|---|---|---|
| OGAD functions and screens | `~/analysis/offgrid-0.0.59/inventory-ogad.md` (component and doc list), `docs/reference/OGAD-RE-PASS1..10, 12, 13` | static read; the live capture (pass 12) never got past the first window; the model-picking rule and action engine sit in an unpublished sibling package; Pro slots not studied |
| OGAM screens and behaviours | `inventory-ogam.md` (`src/screens/*`), `OGAD-RE-PASS11`, `PASS14`, `OGAM-VS-CAESAR` | read, never built or run; native code, sync code and MCP code not read |
| Prototype | `docs/design/prototype/caesaros-new` (`pages.js`, `og.js`, `ns.js`, `index.html`) | read in code, **not rendered by me**; it is demo data (its own header says so). "In prototype" means a page or sketch exists there, not that it works |
| New shell, today | `~/apps/caesaros-m2` (`shell/integrate-m2`), own core on port 4472 with an empty data folder, Chromium 1440x900 and 390x844, theme Neo Roma, EN | one theme, EN only for these shots; 4410 was not touched. Screens: `docs/design/captures/parity-2026-11-22/` (`1440-<name>.png`, `390-<name>.png`) |

The new shell renders six routes: `/start`, `/chat`, `/modules`, `/notes`, `/devices`, `/settings`, plus the palette, the rail flyout (390: drawer), the terminal pane, the first-run tour and the approvals host. Everything else below is a gap in the shell today. The `/api` surface confirms it: settings, model servers (with key), gateways, notes, plugins, terminal, tokens, audit, engines, detect, events. There is no route for media, downloads, projects, memory search, voice, connectors, backup or updates.

Shell column: **yes** = works and was seen; **part** = exists, narrower than the original; **no** = absent.

## 1. Frame and navigation

| Function | Source | In prototype | In new shell (shot) | Gap | What to add |
|---|---|---|---|---|---|
| Collapsing sidebar groups that show the active child, never reflow | OGAD pass 10 R3, section 2 | rail with grouped catalogue (Talk, Day, Knowledge, Work, Make, Private Data, System) | **part**: slim rail plus Apps flyout (`1440-flyout`, `390-drawer`) | rail shows no active child name; no remembered group state | flyout shows group and active app; groups remember open or closed; no layout shift |
| Command palette: search everything, jump to any screen, grouped "Go to" and "Results" | pass 10 section 2, R1 | palette sketch in `ns.js` | **part** (`1440-palette`): module commands only; empty state "No module offers a command right now" | screens not listed, so the palette is empty on a fresh install; no results group; no "see all" | list every route and every Settings section (id plus subroute); fuzzy match; recent first; tap target on phone (button exists) |
| App Back/Forward history with buttons | R2 | not seen | **no** | no history owner, no buttons | app-level history, two buttons in the top bar, swipe on phone (parity rule) |
| One shortcut catalogue with a drift test | R4, `KeyboardShortcuts` | shortcuts list in `ns.js` | **no on this branch** (R37 keymap lives on `shell/r37-settings-overlay`, review pending) | not merged | merge R37 after review |
| Settings sections addressable (`/settings/<section>`) | R1 | single settings page | **part** (`1440-settings`: one long page) | no section routes, no section nav | section list on the left, each deep-linkable and searchable from the palette |
| Locked entries visible but marked | R9 | owner-only tags in catalogue | **part**: owner-only entries are hidden | cannot see what a build lacks | show locked rows with a plain reason, no padlock art that looks like a paywall |
| "What it does for you" guide, topics with pictures | pass 10 section 2; OGAM `GuideScreen`, `GuideTopicScreen`, `useGuideAction` | none | **no** (the one-time tour is the only help) | no guide, no help topics | Guide page: short topics, one picture each, a "do it for me" action that opens the right screen |
| Three-pane chat workspace (list, chat, task pane), resizable | pass 10 section 2, R5 | split layout in `ns.js` | **part** (`1440-chat`): list plus chat; terminal is the bottom pane | no resizable panes, no task pane | one layout state owner; drag handles with keyboard equivalents; task pane for actions |
| About (version, licences, credits) | OGAM `AboutScreen`; OGAD `SoftwareUpdateSection` | none | **part**: version in Settings | no licence list, no credits | About with version, build, licences, credit line for studied sources |

## 2. First run and onboarding

| Function | Source | In prototype | In new shell (shot) | Gap | What to add |
|---|---|---|---|---|---|
| Six-step first run, fixed footer with step dots, step id saved (resumable) | OGAD pass 10 section 3, R6 | setup checklist (`ogSetupList`: where it runs, models, ...) | **part** (`1440-start`): one scrolling page of cards (language, machine, model, brain) | no steps, no progress, not resumable by step | stepper with dots, one decision per step, saved by step id; keep every current choice |
| Hardware-based recommendation ("configure it for me") | pass 1, pass 12; OGAD `BestSettingsCard`, `setup/*` | model tabs: Conservative, Balanced, Extreme with sizes | **part**: detection lists tools on PATH only | no RAM, GPU or disk read, no recommendation | read RAM, VRAM, disk locally; three tiers (Quick start, Balanced, Max), one default, hide a tier equal to another (O1); visible total and Cancel before any download |
| Intro slides (5), keyword, headline, sentence, Skip always visible | OGAM pass 14 section 1 | none | **no** | no intro | optional slide list, extensible by modules (O4), never a trap (O6) |
| Auto setup plan chooser, re-runnable from Storage, "Skip for now" / "Not now" | OGAM `AutoSetupScreen` | none | **no** | cannot re-run setup | re-runnable from Settings; label becomes "Not now" and returns |
| Get Started checklist derived from real state | pass 14 section 2, O2 | `ogSetupList` | **no** | missing | panel with ticks from real state (model source, first message, terminal, engine, settings); a gateway counts as "has a model" |
| Guided tour: navigate, spotlight one element, once | pass 14 O3 | none | **yes**, desktop, 4 HUD labels | phone tour hidden; no per-element "shown" map | keep; stable anchor names; phone variant later (parked) |
| Analytics consent in first run with "what we share" | OGAD pass 9, R8; OGAM `AnalyticsInfoScreen` | privacy rows in `og.js` | **no** | no consent step, no what-we-share | step with default off and a plain list of what leaves the device |
| Passphrase setup, lock screen, security settings | OGAM `PassphraseSetupScreen`, `LockScreen`, `SecuritySettingsScreen` | Vault page sketch | **no** | by decision: no PIN anywhere (2026-11-17) | **not adopted**; recorded here so it is a decision, not a gap |

## 3. Chat

| Function | Source | In prototype | In new shell (shot) | Gap | What to add |
|---|---|---|---|---|---|
| Streaming chat, markdown, copy, rename, delete, stop | OGAD `MemoryChat/*`, `ChatMarkdown` | chat in `ns.js` | **yes** (`1440-chat`, `390-chat`) | tables and nested lists not rendered | tables, nested lists, code copy, safe links |
| Conversation list: search, date groups, pins | OGAD `MemoryChat` sidebar; OGAM `ChatsListScreen` | list sketch | **part**: flat list | no search, groups, pins | search, date groups, pin, project filter |
| Model picker in chat with capability icons | OGAD `ModelPicker`, `ModelCapabilityIcons`; OGAM `ChatModalSection` | model tabs in `og.js` | **part**: one chip ("Claude Code, default") | chip, not a menu; no capability icons | CAESAR Select with engine, model, capabilities (vision, tools, reasoning) as own icons |
| Thinking block (collapsible reasoning) | OGAD `ChatThinkingBlock` | none | **no** | missing | collapsible block under the reply, closed by default |
| Tool rows (what was called, result, timing) | OGAD `ChatToolRows`, `chat-tool-projection`; pass 3 | none | **no** | missing | one row per call, expandable, tied to the action record |
| Approval card bound to the chat id | pass 10 R7; pass 3; OGAM B4 | approvals host sketch | **part**: approvals host in core, no card inside `/chat` | not bound to the session in the UI | card per chat, answerable only in that session |
| Attachments (image, document) and document preview | OGAD pass 3; OGAM `DocumentPreviewScreen` | none | **no** | missing | drag and drop plus button, preview, size limits |
| Vision in chat, remote vision settings | OGAD `RemoteVisionSettingsTab`; pass 6 | none | **no** | missing | follow engine capability; say plainly when the model cannot see |
| Voice: dictation into the composer, spoken replies | OGAD `ChatVoiceComposer`, `VoiceBubble`, `DictationOverlay`; pass 5 | Voice rows in `og.js` | **no** | missing; Wayland feasibility first | dictation first (local), spoken replies later; mic button on phone too |
| Message queue while generating | OGAM `chatQueueView` | none | **no** | missing | visible queue, cancel each |
| Context compaction with a fixed budget, visible | OGAM B2 | none | **no** | invisible | small context meter, summary stored per session |
| Image generation inside chat | OGAD `ImageSettingsTab`, pass 8; OGAM `useSaveImage` | Image Studio page | **no** | missing | image result card, saved to Gallery |
| Conversation title actions, export | OGAD `ConversationTitleActions` | none | **part** (rename, delete) | no export | export to markdown into Notes |
| Skills panel, slash commands | OGAD `SkillsPanel` | Skills page | **no** | missing | slash menu from modules and skills |

## 4. Models, engines, downloads

| Function | Source | In prototype | In new shell (shot) | Gap | What to add |
|---|---|---|---|---|---|
| Model list with sizes, fit tier, tags, search | OGAD `ModelsScreen`; pass 1; OGAM `ModelsScreen`, `SearchModelScreen` | Models page | **no** (only model servers in Start and Settings) | no catalogue, no fit | page from a local catalogue plus search; fit from detected hardware |
| Safe downloader: queue cap, resume, checksum, retry, cancel | pass 1 M-items; OGAM `DownloadManagerScreen`, `ModelDownloadScreen` | download rows | **no** | missing | downloads page, FIFO with cap, persisted state, retry, visible total |
| Load policy (one at a time, balanced, aggressive), "load anyway" | OGAM pass 11 section 1.2 | Conservative, Balanced, Extreme | **no** | needs a local engine | only when local loading exists; policy as data |
| Per-model settings (context, temperature, GPU layers) | OGAM `ModelSettingsScreen` | none | **no** | missing | per-model drawer, plain names, reset to default |
| Add a model server (OpenAI-compatible), key kept local | OGAM `RemoteServersScreen`, `RemoteServerEditorScreen` | Gateway sketch | **yes** (`1440-start`, Settings) | model list per server not shown | discovered models per server and a test button |
| Engine updates, staged trial | OGAM `EngineUpdatesScreen` | Updates page | **no** | not needed until a local engine ships | later |
| Storage: sizes per model, cache, clear | OGAM `StorageSettingsScreen` | Storage in `index.html` | **no** | missing | page with bars per kind, delete with confirm |
| Device info (RAM, GPU, tier) | OGAM `DeviceInfoScreen`; OGAD health panel | Health page | **no** | missing | machine card in Start and Settings |

## 5. Gateway, devices, sync

| Function | Source | In prototype | In new shell (shot) | Gap | What to add |
|---|---|---|---|---|---|
| Local gateway API (OpenAI-compatible), keys, keep loaded | OGAD `GatewayScreen`, `GatewayApiKeysSettings`, `GatewayKeepLoaded`; `docs/API.md`, pass 2 | Gateway page with curl example | **part**: agent tokens exist, no endpoint for other apps | no OpenAI-compatible endpoint; ours stays loopback-only | endpoint on loopback, per-key scope, copy-ready snippets |
| Devices list with the route in use | OGAM `docs/PERSONAL_MESH.md`, B3 | Devices page | **part** (`1440-devices`: this device, add gateway, check) | no pairing, no route shown | pair once, two switches (visible, look for devices), connect by address, row shows route |
| Phone to desktop link, sync of chats and notes | OGAM pass 11 section 1.5 | Devices sync rows | **no** | needs core sync | N4 and S5 plan, stable entity names |
| Backup and restore | OGAD `BackupRestoreSection`; pass 7 | Brain backup rows | **no** | missing | backup to a folder or the VPS, restore with preview |
| Software update | OGAD `SoftwareUpdateSection` | Updates page | **no** | client updates need Konrad's yes each time | check-only first, apply only on tap |

## 6. Memory, notes, knowledge

| Function | Source | In prototype | In new shell (shot) | Gap | What to add |
|---|---|---|---|---|---|
| Notes with revisions and trash | pass 4 | Scriptorium page | **yes** (`1440-notes`) | no tags, links, cross-search | tags, backlinks, search; keep Obsidian-compatible format |
| Knowledge base: documents, embeddings, search, rebuild notice | OGAM `KnowledgeBaseScreen`; OGAD `EmbeddingRebuildNotice`; pass 4 | Knowledge in `ns.js`, Memory page | **no** | missing | add documents, local index, search in palette, clear rebuild notice |
| Projects (prompt, files, chats per project) | OGAD `ProjectsScreen`; OGAM `ProjectsScreen`, `ProjectDetailScreen`, `ProjectEditScreen`, `ProjectChatsScreen` | project rows in `og.js` | **no** | missing | Projects page; a project sets default model and knowledge |
| Meetings: record, transcribe locally, summary | pass 5; OGAD meetings (Pro slot) | Meetings page | **no** | needs local transcription | Commentarii later (task #40) |
| Dictation into any app | pass 5 | Voice rows | **no** | Wayland injection test pending | after N0 |

## 7. Integrations, actions, media

| Function | Source | In prototype | In new shell (shot) | Gap | What to add |
|---|---|---|---|---|---|
| Connectors: catalogue, secrets form, pull query | OGAD `ConnectorsScreen`, `ConnectorSecretsForm`, `connectorCatalog`; pass 6 | Integrations page | **no** | missing | module-registered connectors; secrets local, shown once |
| Quick connections | OGAD `QuickConnections` | cards with Connect | **no** | missing | same mechanism |
| MCP servers | pass 6; OGAM tools | Integrations | **no** | missing | MCP page, trust line per server |
| Actions and approvals (draft then tap), action vocabulary | OGAD `actions/*`, `docs/ACTION_VOCABULARY.md`; pass 3 | approvals host sketch | **part**: `core/approvals.ts` | no list, no history UI | action record list, one per approval, history |
| Computer use tasks with step details and retry | OGAD `tasks/*`, `TaskLineups`; `COMPUTER_USE.md` | Missions page | **no** | owner layer | task pane with steps and retry; owner-only |
| Permissions panel (screen, mic, accessibility) | OGAD `PermissionsPanel`, `PermissionGate` | none | **no** | missing | list with plain status and "open system settings" |
| Image and video studio | OGAD `ImageSettingsTab`, `ImageDimensionFields`; pass 8 | Image Studio, Reels | **no** | missing | after a local engine |
| Gallery: images, video, share, delete | OGAM `GalleryScreen`, `GalleryImageScreen`, `GalleryVideoScreen`; OGAD `media/*` | Media Gallery | **no** | missing | gallery with reversible trash |
| Explore (presets, comic reader) | OGAD `explore/*` | none | **no** | niche | later, presets only |
| Vault, clipboard history | CAESAR ideas, not in OGAD | Vault, Clipboard pages | **no** | not in either original | keep as CAESAR additions; later |

## 8. Settings and privacy

| Function | Source | In prototype | In new shell (shot) | Gap | What to add |
|---|---|---|---|---|---|
| Theme, palette, language, motion, text size | OGAD `UiSettingsSection`, `ThemeToggle`, `SettingsPanel` | theme controls | **yes** (`1440-settings`; text size repaired in `d22b09c`) | only one light theme | keep; add follow-system option |
| One settings kit (card, row, section, select) | OGAD `SettingsCard/Row/Section/Select` | kit in prototype | **yes** (CAESAR kit) | none seen | none |
| Voice, image and remote vision tabs | OGAD `VoiceSettingsTab`, `ImageSettingsTab`, `RemoteVisionSettingsTab` | none | **no** | missing | appear when the matching module exists |
| Egress table: every outbound address and why | pass 9 AE1 to AE6 | privacy rows | **part**: `/api/audit` exists, no screen | table not visible | Settings > Privacy fed by the audit log |
| Report a problem | R8 | none | **no** | missing | text and logs the person reviews before anything leaves |
| Startup and fallback notices | OGAD `StartupNotice`, `TranscriptionFallbackNotice` | none | **part**: boot screen text | no notice component | one dismissible notice strip kit |
| Pro tab, locked features | OGAM `ProTabScreen`, `ProDetailScreen`; OGAD `pro/*` | none | **no** | Pro not studied by design | not adopted; locked-entry pattern only (R9) |

## 9. Findings from the screens (not in the originals, but needed for premium)

1. At 1440 the content stops near 1060 px and leaves a dead band on the right (`1440-devices`, `1440-start`, `1440-modules`). Use the width with two columns.
2. The palette is empty on a fresh install (`1440-palette`): the first thing a person tries says "No module offers a command". Screens must always be listed.
3. Start is one long page of equal cards, not a flow (`1440-start`).
4. On a phone the chat puts the conversation list above the thread (`390-chat`) and pushes the composer down. Phone is parked, noted only.
5. Earlier at 140 percent text, Modules showed "Zainstalowane: 1" and "Brak modułów" together. Recheck after the R48 merge.
6. Colour is already a light tint on selected controls (`1440-settings`), which fits the rule. Keep it so, never a solid button fill.

## 10. Build order I would use (desktop first)

1. Frame: screens in the palette, Back/Forward buttons, Settings sections with deep links, active child in the rail (R1, R2, R3).
2. First run as a stepper with a hardware read and three tiers, then the Get Started panel (O1, O2).
3. Chat depth: model menu, thinking block, tool rows, approval card bound to the chat, attachments, list search.
4. Models and downloads once a local engine exists.
5. Projects and Knowledge base, then Gallery.
6. Gateway endpoint (loopback only), pairing, backup.
7. Egress table and report a problem.
8. Voice and meetings after the Wayland test.

## 11. Not verified

- Prototype pages were read, not rendered; "in prototype" may mean layout only.
- OGAD was never run beyond its first window; its screens are known from component names and docs.
- New-shell shots are EN, Neo Roma, empty data. PL and the other themes were covered by the R56 text-size run, not repeated here.
- OGAM behaviours behind native code (engine packs, residency numbers) come from file headers only.

Signed: claude-b
