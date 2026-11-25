---
name: caesar-ui-craft
description: "Use when building or polishing a user interface in any project: control states, spacing, type, depth, choosing a library, throwaway prototypes, and judging whether it feels finished. Project-neutral; a project's design system overrides it."
---

# UI craft

Polish is many small decisions made the same way everywhere. If the project has a design system or look guide, follow it and use this list for the gaps.

## Every control has every state
Rest, hover, pressed, focus-visible, disabled, loading, error, empty. Focus is clearly visible. Disabled says why in text, not only grey. Pressed feedback is instant (under 100 ms). Destructive actions are separated and either confirmed or undoable.

## Space and layout
- Use a 4 px grid and three or four spacing steps; do not invent a new one per screen.
- Group by proximity before borders: more space between groups than inside. Remove a border before adding one.
- A panel's padding is equal on all sides unless a header owns its band.
- One focal point per screen; secondary actions are quieter than the primary.

## Type
- Two families at most plus mono for ids.
- Body 14–16 px, line height 1.4–1.6, line length 45–75 characters.
- Changing numbers use tabular figures so they do not jitter.
- Long strings wrap (`overflow-wrap: anywhere`) or truncate with the full text available; they never widen the page.

## Depth and surfaces
Depth comes from layering, a thin line and a soft shadow, not from heavy gradients. Blur only where something sits over live content, on a small area. Text never sits directly on busy imagery: put a scrim or solid band under it.

## Interaction basics
Targets at least 44–48 px on touch. Nothing hover-only or keyboard-only. Native controls are fine unless the project replaces them; then use the replacement everywhere, not in some places.

## Matching a look
Collect three references, name what they share (density, contrast, rhythm, restraint), and write that as five rules before drawing. Take principles and behaviour, never another product's pixels or assets.

## Choosing a library
Does the platform already do it (CSS, `<dialog>`, `popover`, scroll snap)? Does the codebase already have it? Is the licence compatible with how you will ship? Is the part you use small? If two remain, pick the one with fewer moving parts and write the reason in the commit message.

## Prototyping
A prototype answers one question. Write the question, build the least that answers it in one file with fake data labelled as fake, then either throw it away or promote it on purpose. It must not drift into production by accident.

## Finished means
All states exist, values come from the project's tokens, it works at 390 and 1440 px, worst-case data was tried (`caesar-ui-stress`), motion follows `caesar-motion`, and a screenshot per width is attached.
