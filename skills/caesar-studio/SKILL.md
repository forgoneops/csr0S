---
name: caesar-studio
description: "Use when the owner wants a picture drawn on this machine (ComfyUI, local): describe it, pick a size, get a PNG in the media library under Studio/ with its prompt and seed. Operator only; nothing leaves the machine."
---

# Studio (image generation)

Plugin `studio` (operator only), engine in `plugins/studio/`, backend = ComfyUI at `COMFYUI_URL` (default `http://127.0.0.1:8188`, on this PC it lives in `wherever ComfyUI is installed`, started with `--lowvram --cpu-vae`). The page is built on these routes.

## Routes
- `GET /api/p/studio/status` gives `{ up, checkpoints, sizes, busy }`. If `up` is false the page says ComfyUI is not running and shows how to start it; it never fails silently.
- `POST /api/p/studio/generate {prompt, negative?, size?, steps?, cfg?, seed?, checkpoint?}` returns `{ id }`. `size`: square 512x512, portrait 512x768, landscape 768x512, story 448x768 (kept small for the 2 GB GPU). Steps 5 to 40 (20), cfg 1 to 14 (7). Same seed and settings give the same picture.
- `GET /jobs` (newest first), `GET /jobs/:id` (`queued|running|done|error|cancelled`), `POST /jobs/:id/cancel`, `GET /jobs/:id/image`.

## Rules
- One picture at a time (the PC is memory-starved); up to 8 wait in line. A restart marks unfinished jobs as errors, never silently re-runs them.
- A finished picture is copied to the media library as `Studio/<date>-<words>-<seed>.png` with a `.json` beside it holding prompt, settings and seed, so it can be reproduced.
- The prompt goes to the local ComfyUI only. A cloud provider (Higgsfield) is not built: it would send the prompt out and needs the owner's key and consent per use.
- Installed model today: SD 1.5 (`v1-5-pruned-emaonly-fp16`). More models = drop a checkpoint into ComfyUI's `models/checkpoints`; the status route lists it.

## Tests
`bun test tests/studio.test.ts` (parameters, workflow, ComfyUI client, one-at-a-time queue, filing, cancel, ComfyUI down).

## The page (Pictorium, `/studio`, under Tabularium's family tab)
Describe the picture, pick a shape (buttons), More options (leave out, steps, guidance, seed, model), Draw (Ctrl/Cmd+Enter in the box). The line shows the running job with Cancel; pictures show prompt, size, seed and time with **New take** (same prompt, new seed), **Same seed**, **Save**; failures sit under "Did not finish" with Try again. With ComfyUI down the page says so and offers Check again. On this PC (GTX 860M, lowvram) a 512 px picture at 5 steps takes about two minutes. Start ComfyUI with its output sent to a file (`... > /tmp/comfyui.log 2>&1`): started with a closed stdout it dies in the sampler with `[Errno 32] Broken pipe`.
