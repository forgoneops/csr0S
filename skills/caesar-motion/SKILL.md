---
name: caesar-motion
description: "Use when adding, changing or choreographing motion in a web UI: decide whether to animate at all, pick the property, curve and duration, handle interruption and exit, group several moving parts, stay inside the frame budget, and respect reduced-motion. Project-neutral; a project's own motion rules win."
---

# Motion

Motion explains a change or confirms an action. If it does neither, leave it out. If the project has its own motion rules (a design system, a motion contract), follow them first and use this for everything they do not say.

## 1. Should it move at all?
- **Keyboard actions never animate.** Palette, shortcuts, focus moves, typing: the result is instant.
- **High-frequency surfaces stay still.** Anything triggered dozens of times a minute (list selection, tab switches, hover on dense rows) gets at most a 100 ms colour change.
- **Data does not decorate itself.** A value that updates changes in place; a short tint is fine, a count-up is not.
- Good reasons to animate: show where something came from or went, confirm a press, keep two states visibly related, show the system is working.

## 2. What moves
- Animate `transform` and `opacity`. They run on the compositor. Avoid animating width, height, top, left, margin, box-shadow and large filter radii.
- Need a size change? Scale with `transform`, crossfade between two fixed states, or reveal with a grid-row or `clip-path` technique.
- Blur is expensive: not on large areas, and not blur plus shadow plus gradient on one moving layer.

## 3. Duration and curve
- Feedback 100–160 ms. Panels, menus, sheets 180–260 ms. Nothing in application chrome over 300 ms. Ambient scenes may be slow; they are not UI.
- Enter with ease-out (fast start, soft landing). Exit faster than enter, around two thirds, ease-in or the same ease-out. Moves between two visible positions use ease-in-out. Linear only for endless loops (progress, shimmer).
- Springs belong to things the hand moves (drag release, sheet fling). Carry the release velocity in so nothing jumps.

## 4. Interruption and exit
- Every animation can be cancelled by the next input and restarts from the current computed state, not from rest.
- CSS transitions retarget by themselves, so use them for toggles. Use the Web Animations API when you must read or reverse progress. Never stack a new keyframe animation on a running one.
- A leaving element gets `pointer-events: none` at once and is removed on `transitionend` with a timeout fallback. Exit must never block input.

## 5. Several things at once
- One lead, the rest follow. Followers start 30–60 ms apart, at most five in a row; later ones arrive together. A 20-row list does not stagger 20 times.
- Siblings that stay put stay still. When one item leaves, the others close the gap with one shared transform, not individual delays.
- Replacing a view: outgoing fades and shifts a few pixels, incoming fades in from the same direction. Never both fully visible on top of each other.
- Direction carries meaning: content grows from the control that opened it and returns to it.

## 6. Reduced motion and levels
- Honour `prefers-reduced-motion`: replace movement with opacity changes under 120 ms. If the product has its own master switch (for example Full, Reduced, Off), every new effect gets a rule for each level in the same change, and Off means `document.getAnimations()` is empty and the page idles.
- Pause anything endless (canvas or WebGL backgrounds, flicker, shimmer) when the tab is hidden or motion is off.

## 7. Frame budget
- Profile at 4× CPU slowdown. A dropped frame inside a 200 ms animation is visible.
- `will-change` only on the element about to move, removed after. Permanent `will-change` on many layers costs memory and softens text.
- Do not interleave layout reads (`offsetHeight`, `getBoundingClientRect`) with writes in one frame.
- A CSS variable animated on the root re-styles every inheriting node: set it on the nearest element while animating.

## Plain words for effects
Fade, slide, scale-in (pop), rise (fade plus small upward move), reveal (mask wipe), crossfade, shared-element move, stagger, spring, rubber-band (overscroll resistance), parallax, flicker. Use the plain word in a brief so the reviewer knows what to expect.

## Done means
Stated purpose, transform and opacity only, under the limit, interruptible, reduced-motion handled, watched once at 4× slowdown and once with motion off.
