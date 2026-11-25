---
name: caesar-vox
description: "Use when the owner wants to dictate into CAESAR (chat box, note editor, any text field): hold to talk, double-tap for hands-free, cleaned text at the cursor. Local Whisper, rules-first cleanup in Polish and English, optional model pass. Operator only."
---

# Vox (dictation)

Plugin `vox` (operator only), engine in `plugins/vox/`, speech from `plugins/speech/`. The page (hold button, key handling, pill) is built on these routes.

## Routes
- `GET /api/p/vox/settings` gives settings and whether Whisper is installed. `PUT` changes any of them: `enabled`, `key` (default Alt+Space), `handsFree`, `maxSeconds` (5 to 600, default 300), `lang` (auto|pl|en), `quality` (fast|accurate), `cleanup` (rules|model|off), `commands`, `keepClipboard`.
- `POST /api/p/vox/dictate?lang=&terminal=1` with the audio as body (webm, ogg, mp4, wav, up to 25 MB) returns `{ text, raw, language, audioS, tookS, cleanup, sentToModel, note? }`. The page inserts `text` at the cursor of the focused field.

## Behaviour the page must keep
- Hold the key or the button to record, release to transcribe. Double-tap starts hands-free, one tap stops, it stops by itself at `maxSeconds`. Esc drops the recording or aborts the request; nothing is inserted. On a phone: a hold button (some iOS cases forbid the microphone: say so on screen).
- A pill shows the mode (hold, hands-free), a timer and "Esc cancels"; a screen reader announces it.
- Without the engine the control says so and offers the Install card; never a silent failure.
- `terminal=1` for terminals and code fields: no closing full stop.

## Cleanup
Rules (`clean.ts`): fillers (um, uh, yyy, eee), stutters, spacing, sentence casing, a closing full stop for four words or more. Spoken punctuation ("przecinek", "new line") only with `commands` on. `cleanup: "model"` sends the text to Claude Code (haiku, isolated: no tools, no MCP) and the answer says `sentToModel: true`; a bad or failing reply falls back to the rules text.

## Rules
- Nothing is stored: audio is deleted at once, the text is not logged. Nothing leaves the machine except the opt-in model pass.
- System-wide dictation (any app on the desktop) is not a browser feature. On Omarchy it is `omarchy dictation` with a backend adapter `omarchy-dictation-<name>` (start|stop|toggle); a CAESAR adapter would record with pw-record, post to `/dictate` and type with wtype. Not built: the routes need a local operator credential for a script, which is the owner's decision.

## Tests
`bun test tests/vox.test.ts`.
