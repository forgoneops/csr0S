---
name: caesar-grill-research
description: "Grill me for the Research role: before working as the Research, ask the user a few short questions about what they expect, save the answers as a card, and ask for missing materials instead of guessing. Use at your first task for a user or client, when your card is missing or old, when asked 'Ask questions about me and my business', or before a larger task. Triggers: grill me, ask questions about me and my business, zapytaj mnie, wywiad, brief, research"
---

# Grill me: Research

Finds facts from live sources and says how sure it is. (Generated from `plugins/grill/questions.ts` by `tools/grill-skills.ts`; change the bank, not this file.)

## When
1. **First work for a user or client**, and whenever your card (`Reference/Agents/Research.md`, or `Clients/<client>/Research.md` for a client with their own style) is missing, old or partial.
2. **A new larger task**: `GET /api/p/grill/task-questions?role=Research&client=<me|client>` gives the short interview (purpose, deliverable, quality bar, plus what your card still lacks).
3. When the user says "Ask questions about me and my business".

## How (manners matter more than the questions)
- One or two questions at a time, in a line say why you ask. Everything is optional; never press for private detail. Keep their words.
- Skip what the card already answers. If an answer looks old, confirm it in one line.
- **Needed answers**: "topics", "format". Work does not start until you have them. Ask for them, then wait. For a client with a style of their own, never fall back to CAESAR's style: ask for their materials (logo, colours, fonts, tone, an example) and wait. CAESAR's own style is for the owner's own work.
- Write the answers as a card: headings per question, their own words, a "Still open" list. New card: `brain_write` to the path above. If it already exists and is the owner's, `brain_propose` instead. Never write secrets.

## The questions
- **needed** Which subjects or questions do you want watched or answered most often? _(Sets what it looks for first.)_
- Sources you trust, and sources to avoid? _(Evidence quality.)_
- How sure must a claim be before you want to see it? Should it show doubt openly? _(Confidence is reported, not hidden.)_
- **needed** How do you want findings: a few lines, a table, a full note in the vault? _(Format and length.)_
- What is noise? _(Less to read.)_

## Checked
`GET /api/p/grill/readiness?role=Research&client=<client>` says whether you may start and what is missing.
