# Off Grid Desktop vs CaesarOS (new app): function audit

Read-only. No repo file was changed. Audited 2026-11-23 against `<repo>`
(branch HEAD 743ba07) by reading the code now, not the earlier audits.

**Counts (55 Off Grid functions):** PRESENT 5 · PARTIAL 31 · MISSING 18 · N/A (decided out) 1

Sources for "Off Grid": `docs/reference/OGAD-FEATURE-INVENTORY-CORE`, `OGAD-FEATURE-INVENTORY-MEETINGS-VOICE`,
`OGAD-PRO-BUNDLE-SPEC`, `docs/reference/specs/`, and the 2026-11-22 design audits in caesaros-proto.

How the new app is put together, because it changes every status below:
- The served app is the Atrium (`web/atrium/index.html`); `web/src/pages/*.tsx` is the older classic shell, reachable
  only with `/?classic`, and it owns some screens the Atrium does not (Projects).
- Views come from two layers: `pages.js` draws invented content ("DEMO DATA, NOT THE PRODUCT"), `real.js` loads
  last and silently overrides the views it re-implements with real core data. `tests/atrium-registry.test.ts`
  passes (9 modules, 53 views, page order), which is how the override works without a clash.
  A page with no `V.<name>` in `real.js` stays demo. Demo today: Mail, Social, Reels, Web tools, Media Gallery,
  the Engines routing grid, the nine-step onboarding overlay, Skills-as-tree, and the Crew page body (crew names
  and states are real, the layout around them is not). Fleet is an alias of Devices.
- Status rules used: PRESENT = real data, usable daily. PARTIAL = real but narrower, or a real mechanism with no
  producer or no UI. MISSING = nothing. A placeholder or demo value is PARTIAL even when the page looks finished.

| Function | What it does (behaviour) | In the new app (file:line) | Status | Importance |
|---|---|---|---|---|
| God / assistant (Ares) | Named assistant you chat with by text or voice; answers from memory and tools; acts after approval. | Chat: web/atrium/bridge.js:215 send -> core/chat.ts:168; crew list core/crew.ts:41 -> /api/crew | PARTIAL: text chat with the real crew and tools works; no wake word, no spoken replies, no voice input in the composer | must |
| Video generation | One sentence to a storyboard, consistent faces, narration, captions, local or overnight render. | none | MISSING | skip |
| Tasks (runs) | Every running and finished run in one place with live steps and attention requests. | web/atrium/real.js:595 Horde desk via core/running.ts; finished work only as tool stats (core/usage.ts:34) | PARTIAL: live runs + Stop everything are real; no run history with steps and results, crew runs started outside this core are not listed | must |
| Day (morning brief, meeting prep, priorities) | Briefing from calendar and real activity, per-meeting prep, priorities for the day. | web/atrium/real.js:407 Daily review (calendar, board, notes, usage, goals) -> saves a markdown note | PARTIAL: a real daily page from local data; no generated briefing text, no per-meeting prep, no priority ranking | must |
| Reflect (where time went) | On-device breakdown of time by app, project, person, focus trend. | none | MISSING | later |
| Replay (screen history) | Scrubbable, searchable local screen history. | none | MISSING | skip |
| Meetings: capture and library | Detect a call, record system audio and mic, keep a searchable meeting list. | web/atrium/real.js:498; core/speech.ts:22 | PARTIAL: one note per meeting and recording a file or the mic by hand; no call detection, no system/tab audio, no meeting library beyond note names | must |
| Meeting transcription | Local speech-to-text of the recording, speaker-separated. | core/speech.ts:22 (/api/transcribe, faster-whisper), used by real.js:491 | PARTIAL: local transcription works on an uploaded file or mic recording; no diarization (speakers), no live captions | must |
| Meeting summary and action items | Summary, decisions and proposed to-dos from the transcript. | none | MISSING | must |
| Actions (commitments) | Extracts commitments from chats and meetings, proposes the next step, queues approval. | core/approvals.ts:1 (host + record); /api/handoff for tasks between devices | PARTIAL: an approval host with a decision record exists and is session-bound, but nothing proposes actions from conversations; the queue stays empty unless an agent raises one | must |
| Entities (people, projects, companies) | Records with a synthesised story across sources and a graph. | none | MISSING | later |
| Search (unified, semantic + keyword) | One bar over capture, meetings, entities, connectors, chats. | web/atrium/real.js:330; core/search.ts:14 (FTS over notes, library, chats, board, calendar) | PARTIAL: real keyword search over five local sources; no semantic/embedding search, no mail, entities or files | must |
| Notifications | Morning brief, pre-meeting heads-up, approvals, to-dos, even with the window closed. | web/atrium/real.js:454; /api/failures core/usage.ts:21 | PARTIAL: in-app list from approvals, device inbox, failures, today's events, backup age; no system or phone notification, no pre-meeting heads-up | must |
| Dictation (hold key, text at cursor) | Hold a key, speak, text appears in whatever app has focus; library of recordings. | none (no global hotkey, no text injection; STT only inside Meetings) | MISSING | soon |
| Scribe (writing help everywhere) | Spelling, grammar, rewrite/shorten/tone/translate a selection in any app. | none | MISSING | later |
| Notes | Markdown library, opens Obsidian vaults, wikilinks, backlinks, graph, versions, dictation. | web/atrium/real.js:283 Memory; core/notes.ts (plain files, revision check, .trash, tags, backlinks) | PARTIAL: plain files with autosave, conflict check, trash, tags and backlinks; no version history, no graph view, vault import is a one-way tool (tools/import-vault.ts) not an in-place vault | must |
| Vault (secrets) | Encrypted KDBX4 store for logins, keys, notes and files; KeePassXC compatible. | web/atrium/real.js:389; core/vault.ts (AES-GCM in the browser, ciphertext in the core) | PARTIAL: encrypted secret notes only; no password entries, no key files, no KDBX4/KeePassXC compatibility | soon |
| Clipboard history | Automatic history of text, images and files with a hotkey quick-paste. | web/atrium/real.js:376; core/lists.ts (clipboard shelf) | PARTIAL: a manual shelf you paste into and copy from; nothing watches the system clipboard, no history, no quick-paste hotkey | soon |
| Devices (pair and sync) | Pair computer and phone on the LAN and keep chats, projects, settings in step, encrypted. | web/atrium/real.js:28; core/pairing.ts, core/notesync.ts, core/chatsync.ts | PARTIAL: pairing by code and real sync of notes, tasks, events and encrypted chats between two installs; no phone app, settings not synced, route not shown | must |
| Chat | Local/remote model chat with markdown, thinking, tool rows, artifacts, attachments, previews, message actions, voice, conversation list. | web/atrium/bridge.js:215 (SSE turns), index.html:308 chatView, core/chat.ts:168 | PARTIAL: streaming with engine/model choice, thinking, tool rows, attachments, stop, real sessions; replies are drawn as escaped text so markdown is not rendered, no message actions or export, no voice | must |
| Projects | Named projects holding chats and knowledge files, with a default model. | core/projects.ts (API); UI only in the classic shell web/src/pages/Projects.tsx:22 | PARTIAL: project records with instructions, default engine and knowledge exist and chat uses them; no Atrium screen, so a daily user cannot create or edit one from the new app | must |
| Models (catalogue, download, import) | Fast/Balanced/Best picks per machine, catalogue, safe download queue, local import, free-form Hugging Face, remote catalogue. | web/atrium/real.js:61 Models; core/model-pull.ts; core/hardware.ts:42 advise | PARTIAL: real hardware read, three tiers with sizes, Ollama pull with progress and cancel, installed list and delete; no Hugging Face free-form import, no resume/checksum of our own, no per-model settings | must |
| Gateway (OpenAI-compatible server) | Local OpenAI-style API for other apps with keys, request log, keep-loaded. | web/atrium/real.js:83; core/gateway-api.ts:30 /v1/models, :40 /v1/chat/completions | PARTIAL: loopback-only gateway with API keys and chat completions; no image, speech, TTS or embeddings endpoints, no keep-loaded, no request log view | soon |
| Integrations / connectors / MCP | About 40 connectors with secrets forms and pull queries, plus MCP servers. | web/atrium/real.js:477 Integrations (detects local tools only) | MISSING: it lists installed CLIs and model servers; no connector catalogue, no account secrets form, no MCP client or trust line | must |
| Explore / presets | Guided runs with a form first (comic book, find a flight, compare prices). | none | MISSING | later |
| Command palette | Search everything and jump to any screen, grouped Go to / Results. | index.html:349 pr(); real.js:342 folds in core search hits | PARTIAL: finds conversations, crew, apps, actions and live core results; settings sections and screen routes are not listed, so it cannot jump to a setting | soon |
| Keyboard shortcuts | One catalogue, back/forward, zoom, shown as buttons on the phone. | index.html:390 keydown (Ctrl K, Ctrl `, Alt+1..8, Esc); static list ns.js:100 | PARTIAL: a handful of working hotkeys and a written list; no single catalogue page, no drift test, no Back/Forward | soon |
| Onboarding | Six steps, fixed footer with dots, resumable by step id, hardware recommendation. | web/atrium/setup.js:44 Start (real, saves to core); overlay ns.js:170 (9 steps, demo values) | PARTIAL: the real setup page saves name, tools, accounts and a local model download; the stepper overlay draws nine steps with hardcoded machines, model sizes and a fake pairing code and saves nothing | soon |
| Settings: health, storage, cache | Health panel, storage sizes, cache cleanup, engine updates, performance pack. | web/atrium/real.js:421 Health (/api/hardware, /api/detect, /api/engines, /api/version, /api/running) | PARTIAL: real health of tools, engines and hardware; no storage-per-kind view, no cache cleanup, no engine update | soon |
| Engines, remote model server, AI activity | Engine choice, processing controls, remote server, request logs. | web/atrium/ns.js:119 Engines (demo grid); real model servers core/model-servers.ts; usage core/usage.ts | PARTIAL: model servers can be added and are real, usage per engine is real; the Engines routing page is demo data and nothing enforces the routing | must |
| Data, privacy, analytics, backup | What is stored, opt-in analytics with what we share, portable backup of chats, projects, knowledge. | web/atrium/real.js:116 Settings (backup, audit rows); core/backup.ts | PARTIAL: real backup create/download/delete and an audit log; restore has an endpoint but no UI, notes are not in the backup, no analytics consent screen | must |
| Software update | Update check and install. | web/atrium/real.js:437 Updates | PARTIAL: shows the version and installed tools; never checks for or installs an update | later |
| Best settings card | Plan of speed settings from machine facts, in plain sentences. | core/hardware.ts:42; web/atrium/setup.js:71 (tiers with sizes before download) | PRESENT: reads RAM, disk and GPU and offers three tiers with sizes, one download at a time | must |
| Computer use and web use | Agent acts on apps and sites with approval, step details, retry. | web/atrium/computer.js:42; core/computer.ts (arm with TTL, windows, focus, type, keys, screenshot, audit) | PARTIAL: real armed session, window list, focus, typing, keys and screenshots with an audit trail; pointer clicks are not available, no web use, no task pane with steps and retry | must |
| Split and workspace panes | Resizable chat, history and task panes, saved layouts. | web/atrium/og.js:189 OGLAY, :215 ogSplitHtml (2/3/4 panes, resize, swap, maximise, saved layouts) | PRESENT: five layouts, drag resize, swap, maximise and saved layouts; layouts live in memory only | soon |
| Transcription engine (STT) | Speech to text on the device. | core/speech.ts:22 faster-whisper base, /api/transcribe | PRESENT: local, nothing leaves the machine, one job at a time, 40 MB cap; the model must be installed once | must |
| Image generation | Image settings, dimensions, style presets, lightbox, gallery. | web/atrium/real.js:663 Image Studio; core/imagegen.ts (local SD-Turbo, one at a time) | PARTIAL: real local generation with prompt, three sizes and a picture list; no style presets or negative prompt, no lightbox, not reachable from chat, needs a one-time engine install | soon |
| Voice / TTS | Spoken replies and voice chat with a chosen voice. | none | MISSING | soon |
| Thinking block | Collapsible reasoning under a reply. | web/atrium/bridge.js:143; core/chat.ts:29 (thinking column) | PRESENT: streamed from the engine, folded, word count | must |
| Tool rows | One expandable row per tool call with input, result and time. | web/atrium/bridge.js:144; core/chat.ts:33, :213 | PRESENT: live rows with running/waiting/ok/error, input, output and duration | must |
| Attachments in chat | Images and documents with preview and size limits. | core/attachments.ts:8; web/atrium/bridge.js:222 | PARTIAL: image and text files with per-kind limits and a vision check; no document preview, drag-and-drop or paste placeholder in the chat view | must |
| Approval card in chat | Approval bound to a conversation, answerable only there. | core/approvals.ts:3; bridge.js:244 decision sends sessionId; card index.html:308 | PARTIAL: session-bound decision endpoint and a card renderer exist; nothing yet produces an approval, so no card appears in practice | must |
| Message queue while generating | Visible queue of messages sent during an answer, cancel each. | none | MISSING | later |
| Context compaction meter | Fixed budget with a visible meter and stored summary. | none | MISSING | later |
| Export conversation | Export a conversation to markdown into Notes. | none (rename and delete only, core/chat.ts sessions) | MISSING | later |
| Skills panel / slash commands | Slash menu from modules and skills. | index.html:341 CMDS (client-side, canned answers); real.js:270 Marketplace lists skills read-only | PARTIAL: the slash menu and suggestions work, but /status and /handoff print canned text; skills can be listed and scanned, not run | later |
| Gallery (images, video) | Browse, share, delete media with a reversible trash. | none (Media Gallery page is demo art, pages.js:44) | MISSING | soon |
| About (version, licences, credits) | Version, build, licences, credits. | none (version only inside Updates) | MISSING | later |
| Guide / help topics | Short topics with a picture and a do-it-for-me action. | none (one-time tour only) | MISSING | later |
| App Back/Forward | History with buttons and phone swipe. | none (tabs only, no history) | MISSING | soon |
| Egress table | Every outbound address and why. | web/atrium/real.js:119 Settings: list of outbound hosts from the audit + local Ollama | PARTIAL: shows the addresses the core uses today; not fed by the rule set, no per-call reason | soon |
| Report a problem | Text and logs the person reviews before anything leaves. | web/atrium/real.js:141 Settings (builds a report text, copy button) | PARTIAL: assembles version, browser and settings into text you copy; no log bundle, no send | later |
| Analytics consent | First-run consent with what we share, default off. | none (no analytics at all) | MISSING (by decision): nothing is sent, so there is no consent step | skip |
| Backup restore | Restore a portable backup with a preview. | core/backup.ts:51 /api/backup/restore (upload, pending, restart) | PARTIAL: the endpoint stages and applies a restore; no UI, no preview, notes excluded from the backup | must |
| Upgrade / Pro screen | Pro catalogue and upsell. | not built, by decision: owner and client editions replace it | N/A: decided out, no upsell anywhere | skip |

## What this means

- The gap is not the shell. Chat, notes, board, calendar, devices, computer use and image generation all read and
  write real local data. What is missing is the sensor and extraction layer (call detection, commitment
  extraction, entities, replay) and the "everywhere" layer (dictation, Scribe, MCP connectors, notifications).
- Three cheap wins for daily work, in order: connectors/MCP (mail and calendar reach the crew), a restore screen
  plus notes in the backup (today a backup silently omits every note), and Projects in the Atrium (the core
  already supports it; only the classic page exposes it).
- Two demos are dangerous because they look real: the nine-step onboarding overlay writes nothing, and the Engines
  routing grid enforces nothing. Both sit one screen away from the real setup page.
- Earlier audits disagree with the code in both directions: "Media Gallery real" and "Image Studio demo" are wrong
  today (Image Studio is real at `real.js:663` with `core/imagegen.ts`, Media Gallery is demo art at `pages.js:44`).
  Trust this table over them.

## Not verified

- Nothing was run end to end except `bun test tests/atrium-registry.test.ts` (3 pass). Transcription, image
  generation and computer use need a one-time local install or an armed session, so they were read, not executed.
- Off Grid behaviour comes from the clean-room documents above, not from running the app today.
