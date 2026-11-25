---
name: caesar-icons
description: Draw and register an own icon for CAESAR's theme sprite and replace emoji or glyph stand-ins. Use whenever a UI needs an icon (button, badge, folder, status mark), when a glyph such as ▶ ■ × + or an emoji appears in the UI, or when a new plugin needs its own mark. Triggers: ikona, icon, własne ikony, emoji w UI, sprite.
---

# Own icons, never glyphs

CAESAR draws its icons. No emoji, no Unicode symbols as icons (▶ ■ × + − ✓ 🎤), no icon libraries.

## Where they live
- `themes/<theme>/icons/<name>.svg` one file per icon, `themes/<theme>/icons/icons.json` one entry per icon (`about`, `fracture`).
- `bun run theme` builds the sprite (`themes/<theme>/dist/icons.svg`); the page uses `<Icon name="<name>" size={n} />` from `web/src/ui/bits.tsx`. Never inline an `<svg>` in a component.

## The recipe (matches the existing set)
1. SVG: `viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"`, content inside a 3 to 21 safe area, no fills (a play triangle is an outline), one idea per icon, at most 3 shapes.
2. `icons.json`: `"name": { "about": "what it means", "fracture": [x, y, angle] }`. The fracture is the small cut of the CAESAR look (a thin rotated slit); put it on a stroke that is not the main read, angle 35 to 60.
3. `bun run theme`, then render a sheet at 16, 24 and 64 px on the dark background and look at it. Redraw anything that reads as something else (a flame that looks like a ghost, a first "armory" that read as ♂ were both redrawn).
4. Replace the glyph in code with `<Icon>`. Mirror with CSS (`scaleX(-1)`) instead of drawing a second icon for "previous".
5. Commit the svg, icons.json and the rebuilt dist together.

## Names already taken
Check `themes/hexameter/icons/` first. Added so far for voice and files: mic, stop, play, speak, pause, lock, close, plus, minus, folder, star, image, video, book, flame, crown.

## Do not
- Do not use a text glyph "just for now". A missing icon is a task: draw it.
- Do not draw decorative detail that disappears at 16 px.
