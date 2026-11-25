---
name: caesar-ui-review
description: Find and fix text wrapping, overflow, clipped popups, modals and tooltips in CAESAR's UI with worst-case data on desktop and a 390 px phone. Use after any UI change, when text breaks out of a box, when a popup is cut off, or when asked to polish or stress-test screens. Triggers: zawijanie tekstu, overflow, popup ucięty, modal, tooltip, wąski ekran, polish UI.
---

# UI review: wrapping and popups

## Method
1. Drive the real nightly with Playwright (`~/.local/share/mise/installs/npm-playwright/latest/node_modules/`), never a mock. The splash needs `waitForTimeout(3500)` then a click on the button named "Enter CAESAR". Viewports: 1300x850 and 390x800 (`hasTouch`).
2. Feed worst-case data: a 60-character word without spaces, a long email, a URL, a one-letter name, 0 items, 200 items, Polish diacritics, emoji. Use the `break-ui` skill for the data list.
3. Detect, do not eyeball only: in the page, find elements where `scrollWidth > clientWidth` (not inside an intentional scroller), and elements whose bounding box leaves the viewport (popups, menus, tooltips, the chat dock window).
4. Screenshot each broken thing before and after.

## Usual fixes
- Text in flex or grid children: `min-width: 0` on the child, then `overflow-wrap: anywhere` (or `word-break: break-word`) on the text; truncate only labels, with `text-overflow: ellipsis` and a title.
- Mono uppercase labels with letter-spacing overflow first: allow wrap or shorten at <=560 px.
- Popups: position from the trigger, flip when there is no room, `max-width: calc(100vw - 24px)`, `max-height` with its own scroll, safe-area padding on a phone.
- Fixed bottom things (dock, live bar) must not cover the last control: `padding-bottom` from `--cd-dock-bottom`.

## Done means
Typecheck, tests, a clean detector run at both widths, screenshots checked against the CAESAR look ([[caesar-icons]], theme tokens), and the report table from [[caesar-crew-board]].
