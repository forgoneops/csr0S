---
name: caesar-legio-icons
description: "Use when adding, changing or checking an icon in CaesarOS: the Legio icon family and its dot-matrix variant. Also: 'nowa ikona', 'icon pack', 'Legio', 'dodaj ikone'."
---

# Legio icons

One family: ancient Neo-Roma meets cyberpunk. Generated, so it stays one family.

## The style rules
24 px grid, 2 px live-area padding, **1.75 stroke**, mitred joins, square caps, **no curves** (every turn is 90 or 45 degrees, the same cut as the UI corners), **one small square "node" accent per icon** that takes `--icon-accent` (ember), Roman motifs where they fit (laurel, column, crown, helmet). Craft rules (one stroke weight, keyline shapes, optical padding) come from general icon-design guidance; every shape is our own drawing.

## Add or change one
1. Edit `tools/make-legio-icons.py`: add `icon("name", "<path>", [(x, y) node squares])`. Helpers: `rc(x,y,w,h,c)` is a rectangle with the UI cut, `oct_(cx,cy,r)` an octagon.
2. `python3 tools/make-legio-icons.py` writes `packs/icons/legio/legio-icons.svg` and the manifest (it fails if a required role is missing).
3. Copy for the Atrium without the `display:none` on the root: `sed 's/ style="display:none"//' packs/icons/legio/legio-icons.svg > web/atrium/icons/legio.svg`.
4. Look at it: render a contact sheet at 16, 24 and 48 px on the dark background and read it. Fix unclear icons before shipping.
5. Never put `--` inside an XML comment in the sprite (it breaks the standalone file; icons vanish).

## Legio Dot
`node tools/make-legio-dot.mjs` rasterises Legio into a 16x16 square-pixel dot matrix (`packs/icons/legio-dot/`). The idea comes from dot-matrix glyph styles; the dots are square to match our corners. **Use at 28 px and larger only**; at small sizes use Legio.

## Use
`I('name', size)` in the Atrium. The packs system (`/api/packs`) lists both packs for Settings.
