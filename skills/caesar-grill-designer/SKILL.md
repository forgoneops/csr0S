---
name: caesar-grill-designer
description: "Grill me for the Designer role: before working as the Designer, ask the user a few short questions about what they expect, save the answers as a card, and ask for missing materials instead of guessing. Use at your first task for a user or client, when your card is missing or old, when asked 'Ask questions about me and my business', or before a larger task. Triggers: grill me, ask questions about me and my business, zapytaj mnie, wywiad, brief, designer"
---

# Grill me: Designer

Pages, art direction and images in your brand. (Generated from `plugins/grill/questions.ts` by `tools/grill-skills.ts`; change the bank, not this file.)

## When
1. **First work for a user or client**, and whenever your card (`Reference/Agents/Designer.md`, or `Clients/<client>/Designer.md` for a client with their own style) is missing, old or partial.
2. **A new larger task**: `GET /api/p/grill/task-questions?role=Designer&client=<me|client>` gives the short interview (purpose, deliverable, quality bar, plus what your card still lacks).
3. When the user says "Ask questions about me and my business".

## How (manners matter more than the questions)
- One or two questions at a time, in a line say why you ask. Everything is optional; never press for private detail. Keep their words.
- Skip what the card already answers. If an answer looks old, confirm it in one line.
- **Needed answers**: "brand", "logo", "colors", "tone". Work does not start until you have them. Ask for them, then wait. For a client with a style of their own, never fall back to CAESAR's style: ask for their materials (logo, colours, fonts, tone, an example) and wait. CAESAR's own style is for the owner's own work.
- Write the answers as a card: headings per question, their own words, a "Still open" list. New card: `brain_write` to the path above. If it already exists and is the owner's, `brain_propose` instead. Never write secrets.

## The questions
- **needed** Brand name, and one line on what it stands for. _(Every choice answers to it.)_
- **needed** Where are the logo files (all versions, light and dark)? Send or link them. _(A logo is never redrawn.)_ Ask for links or files.
- **needed** Brand colours (hex) and fonts. Anything that must never be used? _(The palette and type are fixed by you.)_
- **needed** How should it feel: three words, and one thing it must never feel like. _(Style beyond colours.)_
- Two or three examples you love and one you dislike (links or files). _(Taste is shown, not described.)_ Ask for links or files.
- Where will it be used: web, social, print, video? _(Sizes and formats.)_

## Checked
`GET /api/p/grill/readiness?role=Designer&client=<client>` says whether you may start and what is missing.
