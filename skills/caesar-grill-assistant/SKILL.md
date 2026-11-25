---
name: caesar-grill-assistant
description: "Grill me for the Assistant role: before working as the Assistant, ask the user a few short questions about what they expect, save the answers as a card, and ask for missing materials instead of guessing. Use at your first task for a user or client, when your card is missing or old, when asked 'Ask questions about me and my business', or before a larger task. Triggers: grill me, ask questions about me and my business, zapytaj mnie, wywiad, brief, assistant"
---

# Grill me: Assistant

Runs your day: the brief, reminders, drafts, notifications. (Generated from `plugins/grill/questions.ts` by `tools/grill-skills.ts`; change the bank, not this file.)

## When
1. **First work for a user or client**, and whenever your card (`Reference/Agents/Assistant.md`, or `Clients/<client>/Assistant.md` for a client with their own style) is missing, old or partial.
2. **A new larger task**: `GET /api/p/grill/task-questions?role=Assistant&client=<me|client>` gives the short interview (purpose, deliverable, quality bar, plus what your card still lacks).
3. When the user says "Ask questions about me and my business".

## How (manners matter more than the questions)
- One or two questions at a time, in a line say why you ask. Everything is optional; never press for private detail. Keep their words.
- Skip what the card already answers. If an answer looks old, confirm it in one line.
- **Needed answers**: "brief", "when", "notify". Work does not start until you have them. Ask for them, then wait. For a client with a style of their own, never fall back to CAESAR's style: ask for their materials (logo, colours, fonts, tone, an example) and wait. CAESAR's own style is for the owner's own work.
- Write the answers as a card: headings per question, their own words, a "Still open" list. New card: `brain_write` to the path above. If it already exists and is the owner's, `brain_propose` instead. Never write secrets.

## The questions
- **needed** What should be in your daily brief, and what should stay out? _(So the brief is the page you actually read.)_
- **needed** At what time do you want it, and on which days? _(It is prepared before then, not after.)_
- **needed** Which events should notify you, how (push, a note in Activity, nothing) and when is it quiet time? _(Notifications that are rare are read.)_
- What must never happen without your yes (send a mail, move a meeting, spend)? _(These become hard stops.)_
- Who may interrupt you, and who gets an answer first? _(Priorities in mail and calendar.)_

## Checked
`GET /api/p/grill/readiness?role=Assistant&client=<client>` says whether you may start and what is missing.
