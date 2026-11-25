---
name: caesar-pixel-painter
description: Paint exact pixel art (icons, sprites, avatars, tab art) on a fixed palette with a JSON paint script and look at the result as a text grid, no image model needed. Deterministic and replayable, so the same script gives the same pixels. Use for CAESAR's own icons and small art on the theme palette. Triggers: pixel art, sprite, ikona, piksele, avatar pikselowy, paint script.
---

# Pixel painter (paint with tools, see the grid)

Method: the agent does not generate an image, it **paints**: shapes, noise and per-pixel edits on a palette, then looks at the canvas and fixes what is wrong. Here it is a small standard-library script, `skills/caesar-pixel-painter/canvas.py`, written fresh (no code taken from that project).

## Loop (do it in this order)
1. **Palette first.** Take 4 to 8 colours from the theme tokens (Hexameter: black ground, ember crimson, orange, pale gold; Agentic: its own neutral colours). Index 0 is the darkest. Never invent colours outside the palette.
2. **Write `paint.json`** (in the job's `tmp/`, never `/tmp`): `{"size":[16,16],"palette":["#0d0e10", ...],"ops":[ ... ]}`. Ops: `px`, `rect`, `line`, `circle`, `ellipse`, `tri`, `noise`, `voronoi`, `mirror` (see the header of `canvas.py`).
3. **Look:** `python3 skills/caesar-pixel-painter/canvas.py paint.json --view` prints the grid (one character per pixel: `0-9A-Z` is the palette index, `.` is transparent) and the colour use. Read it like a picture: is the silhouette right, are the edges clean, is there one clear light side?
4. **Fix with ops, not by redoing it all:** add or change a few ops, run `--view` again. Build big shapes first, then shading, then single pixels. Use `mirror h` for anything symmetric (faces, crystals, sprites) and paint only the left half.
5. **Export:** `python3 skills/caesar-pixel-painter/canvas.py paint.json out.png --scale 16` writes a transparent RGBA PNG with exact, hard edges (nearest neighbour). Keep `paint.json` next to the PNG: that is the source.

## Rules
- Work at the real size (16, 24, 32, 48). Upscale only at export.
- Caesar's trademark: the scar and the crystal always glow (use the lightest palette colour on them). No ape or skull; no copyrighted characters.
- CAESAR's own icons follow `caesar-icons` (drawn by us, cut corners). This skill is how a new one is painted when it must be pixel style.
- A result is "done" only after you looked at the grid and at the PNG, not after the script ran.
