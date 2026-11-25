---
name: caesar-ui-stress
description: "Use to try to break a piece of UI with worst-case data before it ships: very long and very short text, missing fields, huge counts, zero items, non-Latin text, emoji, extreme numbers, slow and failing responses. Produces a report of what broke with a fix for each."
---

# UI stress test

The happy path always works. Real data does not look like the demo.

## The data set (one at a time)
- **Text**: one character; 200 characters without spaces; an 80-character email; a 3-line title; leading and trailing spaces; right-to-left; Polish diacritics; CJK; an emoji with a skin tone and a flag; a string containing `<b>` and `&`.
- **Counts**: 0, 1, 2, 999, 100000 items; a badge reading 1000000.
- **Numbers and dates**: 0, negative, 0.1+0.2, 12 digits, NaN from a bad division, year 1970, a future date, zero duration.
- **Missing**: each optional field absent in turn; null where a string is expected; an image that 404s; an avatar with no name.
- **Time and network**: a reply after 8 seconds; an error with no message; the same request twice; offline half way.
- **Viewport**: 320, 390, 768, 1440 px; 200% zoom; large system font.

## How
Render the component on a scratch route behind a labelled "Demo data / Worst case" switch, never against real data. Screenshot each case at 390 and 1440 px. Read the DOM as well: `scrollWidth <= clientWidth`.

## Broken means
Horizontal scroll; overlapping or silently clipped text; a control off screen or under 44 px; layout shifting when data arrives; a spinner that never ends; an empty state that looks like an error; a raw key or stack trace shown to the person; focus lost after an update.

## Report
A table: case, what happened, severity (breaks use, looks wrong, cosmetic), exact fix (the CSS line or guard). Fixes go in the component, not in the demo data. State which cases you did not run.
