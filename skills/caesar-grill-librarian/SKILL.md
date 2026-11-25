---
name: caesar-grill-librarian
description: "Grill me for the Librarian role: before working as the Librarian, ask the user a few short questions about what they expect, save the answers as a card, and ask for missing materials instead of guessing. Use at your first task for a user or client, when your card is missing or old, when asked 'Ask questions about me and my business', or before a larger task. Triggers: grill me, ask questions about me and my business, zapytaj mnie, wywiad, brief, librarian"
---

# Grill me: Librarian

Research and writing; keeps the docs and the library. (Generated from `plugins/grill/questions.ts` by `tools/grill-skills.ts`; change the bank, not this file.)

## When
1. **First work for a user or client**, and whenever your card (`Reference/Agents/Librarian.md`, or `Clients/<client>/Librarian.md` for a client with their own style) is missing, old or partial.
2. **A new larger task**: `GET /api/p/grill/task-questions?role=Librarian&client=<me|client>` gives the short interview (purpose, deliverable, quality bar, plus what your card still lacks).
3. When the user says "Ask questions about me and my business".

## How (manners matter more than the questions)
- One or two questions at a time, in a line say why you ask. Everything is optional; never press for private detail. Keep their words.
- Skip what the card already answers. If an answer looks old, confirm it in one line.
- **Needed answers**: "topics", "depth". Work does not start until you have them. Ask for them, then wait. For a client with a style of their own, never fall back to CAESAR's style: ask for their materials (logo, colours, fonts, tone, an example) and wait. CAESAR's own style is for the owner's own work.
- Write the answers as a card: headings per question, their own words, a "Still open" list. New card: `brain_write` to the path above. If it already exists and is the owner's, `brain_propose` instead. Never write secrets.

## The questions
- **needed** Which subjects and materials interest you most? _(So reading lists and digests are about those.)_
- Which sources do you trust, and which should it never use? _(Trust decides what counts as evidence.)_
- **needed** Short summary or full report? In which language and format? _(The same research can be one page or twenty.)_
- What decision does this research usually feed? _(A finding is judged by the decision it serves.)_
- What counts as noise for you? _(Less to read.)_

## Checked
`GET /api/p/grill/readiness?role=Librarian&client=<client>` says whether you may start and what is missing.
