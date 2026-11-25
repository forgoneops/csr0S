---
name: caesar-brain-views
description: "Use when you build, change, test or explain the Brain's visualisations (Brain > Connections: Temple, Neurons, List): the dark pixel-art temple with the stained-glass window of the vault, the glowing connectome, the halftone print, the eyes of the gargoyles, live agent activity, and the art pipeline (tools/art.ts) behind them. Also for adding a new view in the same language."
---

# Brain views: Temple, Neurons, List (plugin `brain`, Connections)

The owner's rule for the Brain: it is art first and still useful. Only the interactive part shines; everything else is dark. Only the dots are square.

## The three views (files in `plugins/brain/`)
| View | File | What it is |
|---|---|---|
| **Temple** (default) | `temple.tsx` | The generated hall (`art/out/temple-hall-1-ink.webp`, served from `web/public/art/`) printed in dim halftone dots, 2D pixel-art style. In the door arch a **stained-glass window painted with Caesar on his throne** (`colony-throne-1-ember.webp`): one pane per note (Voronoi, petals by folder, oldest in the centre), the picture shows through every pane, folders turn the hues, bronze lead along folder seams. Tap the window: it expands (blocky pixel-art), tap a pane: the note card. |
| **Neurons** | `arbor.tsx` + `arbor-scenes.ts` + `glow.ts` | WebGL2: the vault as a brain connectome. A note is a neuron on a hemisphere of the cortex (folder = region), a link is a nerve fibre through the white matter with pulses, grey direction-coded wiring in the background, bloom + halftone print (Print/Clear toggle). |
| **List** | `map.tsx` | The plain accessible list of notes. Keep it: it is the keyboard and screen reader twin of the art. |

Shared: `vault-bar.tsx` (time slider + Grow, search, folder buttons), `live.ts` (`useLive()` polls `/api/p/brain/activity` every 5 s: who is touching which note, operator only), `map.tsx` (the Connections page: view switch, filters, the note card, `Needs a look`).

## Behaviour that must survive any change
- **Time travel:** the slider shows the vault on a day, **Grow** replays it (in the Temple the window fills from the centre). Never rebuild on every parent render: Neurons rebuilds only when a content signature changes, and the growth animation plays once (`grown` flag in `arbor.tsx`).
- **Live:** a note an agent touches flares in the window / pulses in Neurons. In the Temple the **eyes of the gargoyles** (`EYES` in `temple.tsx`, normalised coordinates read off the picture) burn while an agent **writes** (hot pulse, each gargoyle a beat behind the last), glow slowly while one **reads**, and sit as a cold ember when the vault is quiet. `reduced-motion`: static, no pulse.
- **Needs a look** notes are red; fresh notes are brighter; search and layer filters light matches and let the rest sink.
- **Desktop and phone:** every gesture has a button; touch targets 44 px; the Temple crops to the centre on a narrow screen.

## Rules of the look
Only square dots (halftone). No emoji, no Unicode icons (own `<Icon>` only). No glow outside the interactive part (the window, the eyes, the live pulses). No captions on the art: names show on hover or when a note opens. No ruler-straight dividers in the glass (folders are parted by a jagged bronze seam).

## The art pipeline
`bun tools/art.ts gen <name> "<subject>" --shape wide|portrait|square --count N` (Codex image generation, house ink style) writes `art/raw/` (git-ignored) and `art/out/<name>-<n>-<accent>.webp` plus `-ink.webp`. Copy the file a view needs into `web/public/art/`. Always generate our own art; never use someone else's picture (the first gargoyle idea came from a tweet: it was a reference only).
Tint of the glass: the picture is read as light and mapped through a jewel ramp (`RAMP` in `temple.tsx`), so any portrait with a clear light and dark works: swap `PIC` to change who sits in the window.

## How to check a change
1. `bunx tsc --noEmit -p .` and `bun test ./plugins/brain/arbor-scenes.test.ts` (the Neurons scene is deterministic, finite, one pick per note).
2. For deterministic component checks, use a throw-away harness: `web/garden-test.html` + `web/src/__gt.tsx` mounts fake nodes and a fake presence response `{who, state: "writing", path}` to see the eyes, then runs Chromium with SwiftShader and reduced motion against the local dev server. Remove both temporary files afterward.
3. For a real UI audit, build the exact candidate before capturing; hard-refresh the local served app and inspect fresh 390x844 coarse and 1440x900 fine screenshots. Do not trust a capture from a build that is still running.
4. For List, capture folded state, one expanded folder, and `Needs a look` on/off. After each filter/expand transition, measure document/body plus `.mp-shell`, `.mp-main`, and `.nl` widths and recheck fixed-overlay intersections. Verify `Open all`/`Fold all` rectangles are inside the viewport and their center hit-test lands on the control or a descendant, not an overlay. Filtering can leave folders expanded, while deep indentation widens `.nl` even when the document root clips the overflow.
5. On a real vault, block non-GET requests, avoid opening notes in the editor, blur note titles/content in captures, and log only geometry/state/counts, never API response bodies. For layout-only checks, stub the activity poll with an empty fixture. Respect the current owner lane: when Brain view files are reserved by the operator or another agent, record findings for that owner instead of editing `plugins/brain/*`; do so only after explicit reassignment.

## Pitfalls seen
- A `//` comment placed in the middle of a long one-line statement comments out the rest of the line (twice broke a view): use `/* */`.
- Easing with a factor above 1 diverges (a view went grey): clamp `Math.min(1, dt * k)`.
- A headless screenshot can be stale while Vite is still compiling: take it again before trusting it.
- Eye coordinates come from `art/raw/temple-hall-1.png` (1672x941); if the hall picture changes, read new ones off a gridded crop.
