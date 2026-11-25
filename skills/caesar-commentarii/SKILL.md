---
name: caesar-commentarii
description: "Use when the owner wants a meeting recorded, transcribed or summarised: online call (tab audio plus microphone) or an uploaded recording. Commentarii makes a note in Meetings/ with summary, decisions and action items above a timestamped transcript. Action items are cards he accepts. Operator only, local Whisper."
---

# Commentarii (meeting notes)

Plugin `meetings` (operator only), engine in `plugins/meetings/`, speech from `plugins/speech/`. The page is built on top of these routes.

## Flow
1. `POST /api/p/meetings/new {title?}` gives an id.
2. `PUT /:id/track/you|them|mix?ext=webm` with the audio as the body (microphone = you, tab audio = them, one file = mix; up to 400 MB). A phone call recording is uploaded as `mix`; live phone calls cannot be recorded by CAESAR (the phone blocks it) and the page says so.
3. `POST /:id/finish {lang?: "pl"|"en", quality?: "fast"}` runs in the background, one meeting at a time: ffmpeg cuts five-minute pieces, local Whisper (small, timed segments) transcribes each, the tracks merge by time as You and Them (the echo of the speakers in the microphone is dropped), the note is written to `Meetings/YYYY-MM-DD-HHMM title.md`, then Claude Code (isolated: no tools, no MCP, no slash commands) writes five bullets, decisions and action items.
4. `GET /:id` shows status (`queued`, `transcribing`, `summarising`, `done`, `error`), progress, lines, summary and cards.
5. `POST /:id/actions/:n/accept {day?|at?}` turns a card into a reminder (only when a day is given or the card has one); `/dismiss` drops it. Nothing reaches the calendar before that.
6. `DELETE /:id` removes the audio and the record; the note stays in the vault.

## Rules
- The summary says only what the transcript says. A failed summary keeps the transcript and says so in `error`.
- Owners are matched to the notes in `People/`; an unknown name stays as spoken.
- Audio lives in `data/plugins/meetings/rec/<id>/`, never in the vault; the pieces are deleted as soon as they are read. Agents cannot reach the routes; the note follows the vault policy.
- Nothing leaves the machine except the one summary call to Claude Code.

## Tests
`bun test tests/meetings.test.ts` (merge, offsets, summary parsing, note shape, the whole path over HTTP with a fake engine and model).
