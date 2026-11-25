---
name: caesar-speech-engine
description: "Use when something needs speech to text: transcribing a recording or a meeting, measuring speed or accuracy (also in Polish), installing or repairing the local speech engine. Also: 'transkrypcja', 'zamien nagranie na tekst', 'silnik mowy', 'whisper'."
---

# Speech engine (faster-whisper, local)

CPU, int8, in `data/speech/venv` (git-ignored), models in `data/speech/models`. Install or repair: `bash tools/speech/install.sh` (Python 3.12; 3.14 has no ctranslate2 wheels; `av` is pinned `>=14,<17`). Transcribe or measure: `data/speech/venv/bin/python tools/speech/measure.py <audio> --model small --lang pl [--ref text.txt] [--text]`. It prints one JSON line: audio seconds, seconds taken, real-time factor, detected language and, with `--ref`, the word error rate.

## Facts (2026-11-05, the PC: 4 cores, no GPU)
**Corrected 2026-11-06:** the 0.30 below came from a clip that was mostly music cut by the voice gate. For real speech `small` takes 1.25 to 1.7 times the length of the speech, `base` (greedy) about 0.4 to 0.7, `tiny` about 0.22 but with many errors. Use `small` where nobody waits (dictation, meetings) and `base` for talking to an agent. (Older note: `small` ran at about 0.30 of real time on that clip.) **Polish accuracy is not measured yet**: it needs about 60 seconds of the operator reading a known text. Ask for that recording; do not guess a figure. `medium` is a 1.5 GB download: ask first.

## From inside CAESAR (plugin `speech`, 2026-11-06)
`POST /api/p/speech/transcribe?lang=pl|en|auto&hint=on|off&quality=fast|accurate` with the audio as the body (operator only; webm, ogg, mp4, mp3, wav; up to 25 MB; the file is deleted right after). `GET /status`, `POST /warm`. Other plugins use the capability `speech` (`core/capabilities.ts`), never the plugin's files. The vault's names (People, Projects) go to the engine as vocabulary. The warm process is `tools/speech/stt_worker.py` (loads on first use, unloads after 10 idle minutes); `tools/speech/worker.py` belongs to another session and is not used.

## Rules
Local only: nothing is sent anywhere except the one-time model download. A recording of other people needs their consent before it is transcribed or kept. Meeting notes and dictation (Vox, Commentarii) are not built yet; they will call this engine through one capability, not directly. Details: `docs/design/SPEECH-ENGINE.md`.

## Voice messages (2026-11-06)
`POST /api/p/speech/clips?lang=&quality=` (audio body, headers `x-peaks`, `x-duration`) keeps the audio with its text and waveform; `GET /clips/:id`, `GET /clips/:id/meta`, `GET /clips`, `POST /clips/:id/remove`. Operator only. In the chat a message is `[Voice message, N s, id:ID]` then the transcript. This is the only place audio is kept; everything else is deleted after transcription.
