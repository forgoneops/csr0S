# How Off Grid Desktop works: observed live, and how it maps to CaesarOS

Author: claude-b, 2026-11-22. Konrad's order: test the real functionality of Off Grid, because its functionality is how he imagined Caesar. Method: the installed app (v0.0.59), run through its debugging port in a sandbox with no network, driven by `live-audit/jobs/11-functions.mjs` and `12-functions2.mjs` in the analysis folder. Not touched: the Clipboard screen, the licence and secret files, anything that sends data. Test data created (one note) was removed afterwards. Combined with the clean-room specs in `docs/reference/` (not repeated here).

## What I ran and saw

| Function | What happened | What it tells us |
|---|---|---|
| **Chat** | A fresh message to the installed 27B model took **127 s to the first word** (the model loads on first use, status line says so). The reply was right. An 80-word answer later took 166 s in total including a reload | Local 27B on this machine is slow; the setup must recommend a small model first and say how long the first answer takes |
| Chat composer | One box carries: attach, a memory scope pill ("All memory"), a model chip ("Bonsai 2 27B · 16K"), then **God, Thinking, Voice, Image, Video** chips, mic and send | **One composer does every modality.** We have attach, context, model chip and Thinking; Voice, Image and Video chips wait for their engines |
| Chat layout | Conversation list with search and "Today" groups; open conversations as tabs with "open tabs side by side"; header buttons for sidebar, device, settings, gallery, split, tasks | Same shape as the Atrium: sessions list plus tabs plus split |
| **Notes** | Ctrl+N creates a note in a plain folder (`~/Documents/Off Grid Notes/`); the editor is a rich-text editor that **saves itself**; the file is named from the first heading (`Caesar test note.md`); tags and `[[links]]` are written as plain text | Files you own, no database; autosave and title-as-filename. Ours: explicit save with conflict check; autosave and title-as-name are worth adding |
| Projects | Empty state "Create one to configure a knowledge base"; a project is a knowledge base | Ours: projects exist in the core; link them to Knowledge |
| **Meetings** | Tabs Calendar and Recorded, a Record meeting button, "Keep recording when away", empty state says "Zoom and Meet calls record on their own". Not recorded (it needs the screen-share portal and a microphone) | Behaviour from the spec: detect the call, record two tracks, transcribe locally, summarise, propose to-dos |
| **Gateway** | The server is **already listening on `0.0.0.0:7878`** (all interfaces) with "API key not required" as the default, and a sync port `37878`. `/v1/models` lists every installed model with its kind (chat, vision, image, video, speech) and context length. Seven endpoints: chat, images, videos, speech-to-text, text-to-speech, embeddings, models. Keep-loaded model, expiring API keys | Ours must stay on loopback and require a key by default (done: gateway-api). Take the model list with kinds and the one-API-for-every-modality idea |
| Tasks | "No task history yet. Web Use and Computer Use runs appear here with status, steps and results" | A run history with steps; planned in the Computer page |
| God | A named assistant ("Ares") that is a downloadable persona; "works while you are away, asks before it acts" | Ours is Caesar and the crew; the persona idea is already the crew |
| Day, Actions, Entities, Voice | Empty states that teach what to turn on ("Hold Alt+Space to dictate") | Every empty state says how to fill it; we do the same |

## How it does everything (the shape)
Every function is the same four parts: **a local engine** (model, speech, vision, image), **a sensor or source** (screen, microphone, files, accounts), **a store** (plain files, a local database), and **a small approvals layer** in front of anything that acts. Nothing leaves the device unless the person turned it on. That is the architecture the Atrium follows:

| Off Grid part | CaesarOS part |
|---|---|
| Local engine and model advisor | Engine registry (Ollama, CLI tools, Hermes crew, model servers), hardware read, model pull |
| Sensors (screen, mic, files) | Our own computer layer (`core/computer.ts`, in progress), voice and meetings (waiting on local transcription) |
| Stores (Markdown notes, SQLite) | Notes as files, the core's database, knowledge index |
| Approvals before acting | Approval cards in chat and Home, decision record |
| One OpenAI-compatible gateway for every model | Gateway API on loopback with keys |
| Pairing and sync across devices | Pairing code, paired devices, sync of notes, tasks and events (claude-a) |

## Differences we keep on purpose
Loopback-only gateway with a key; no analytics; the crew and the Brain; approvals in the conversation; Rome and cyberpunk look; computer use that works from a helper which sets its own session environment and refuses secret fields.

## Not tested
Meeting recording, dictation with the hotkey, computer use runs and image or video generation were not run (each needs a microphone, the screen-share portal, or a long model load). The Pro-only screens were read from their text, not exercised.
