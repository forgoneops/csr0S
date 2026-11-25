---
name: caesar-track-sync
description: Take a music track (a YouTube link or a file), get its beats and loudness, pick the right cut, and lay it under a video with fades, so visuals can hit on the beat. Use for any clip, loop, promo or post that must follow a song. Triggers: muzyka, utwór, w rytm, bit, beat, do utworu, podkład, yt-dlp, dźwięk do wideo.
---

# Track sync (music under a video, effects on the beat)

## Steps
1. **Get the track** (personal use, as the owner asked): `yt-dlp -q --no-warnings --no-simulate -x --audio-format wav -o 'track.%(ext)s' "<url>"`. `--print` alone only prints and downloads nothing, add `--no-simulate`. Work in the job's `tmp/`, not `/tmp` (that is RAM).
2. **Analyse:** `uv run --with librosa --with numpy python -I skills/caesar-track-sync/audio_env.py track.wav env.json` gives tempo, beat times (seconds) and a 0..1 loudness line (one value per 0.1 s). It takes about a minute for a 5 minute track.
3. **Pick the cut.** the owner decides which part. "From the start" means `--start 0`. For a loud highlight take the 60 s window with the highest RMS that starts on a beat. Length is his word too (20 to 25 s is typical for a post).
4. **Drive the effects** from `env.json` (see `caesar-pixel-cinemagraph`): `pulse(t) = exp(-(t - last_beat) / 0.13)` for hits, the loudness line for slow swells.
5. **Lay the music under the frames:** `ffmpeg -framerate 24 -i f%04d.png -ss <start> -t <len> -i track.wav -c:v libx264 -pix_fmt yuv420p -crf 20 -c:a aac -b:a 192k -af "afade=t=in:d=0.5,afade=t=out:st=<len-1.5>:d=1.5" -movflags +faststart -shortest out.mp4`. The audio `-ss` is the same `<start>` the frames were rendered with.

## Pitfalls (met once)
- **Test frames must come just after a beat.** A beat is a point in time, not frame 0. If effects look absent in a test frame, check the time of the nearest beat before the frame (`searchsorted(beats, t) - 1`); a beat at 38.522 s is not yet there at 38.52 s.
- **Photosensitive-safe:** beat hits are fast decays (0.13 s), at most about 3 per second, never a full-frame flash.
- Demucs stems and the 44.1 kHz vs 48 kHz grid matter only when remixing, not for a plain cut.
- Publishing is the operator's. Leave the file in the gallery folder and say where.
