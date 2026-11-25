---
name: caesar-grill-social
description: "Grill me for the Social role: before working as the Social, ask the user a few short questions about what they expect, save the answers as a card, and ask for missing materials instead of guessing. Use at your first task for a user or client, when your card is missing or old, when asked 'Ask questions about me and my business', or before a larger task. Triggers: grill me, ask questions about me and my business, zapytaj mnie, wywiad, brief, social"
---

# Grill me: Social

Content calendar; posts and replies in your voice. (Generated from `plugins/grill/questions.ts` by `tools/grill-skills.ts`; change the bank, not this file.)

## When
1. **First work for a user or client**, and whenever your card (`Reference/Agents/Social.md`, or `Clients/<client>/Social.md` for a client with their own style) is missing, old or partial.
2. **A new larger task**: `GET /api/p/grill/task-questions?role=Social&client=<me|client>` gives the short interview (purpose, deliverable, quality bar, plus what your card still lacks).
3. When the user says "Ask questions about me and my business".

## How (manners matter more than the questions)
- One or two questions at a time, in a line say why you ask. Everything is optional; never press for private detail. Keep their words.
- Skip what the card already answers. If an answer looks old, confirm it in one line.
- **Needed answers**: "channels", "voice", "never". Work does not start until you have them. Ask for them, then wait. For a client with a style of their own, never fall back to CAESAR's style: ask for their materials (logo, colours, fonts, tone, an example) and wait. CAESAR's own style is for the owner's own work.
- Write the answers as a card: headings per question, their own words, a "Still open" list. New card: `brain_write` to the path above. If it already exists and is the owner's, `brain_propose` instead. Never write secrets.

## The questions
- **needed** Which channels, and how often per week on each? _(The calendar's shape.)_
- **needed** Paste three posts of yours that sound like you. _(Your voice is learned from your words.)_ Ask for links or files.
- **needed** What do you never say, joke about or link to? _(Guardrails.)_
- What should a post usually lead to (a link, a booking, nothing)? _(Every post has a job.)_
- Should it only draft replies for you to send? (Recommended: yes.) _(Nothing is sent for you.)_

## Checked
`GET /api/p/grill/readiness?role=Social&client=<client>` says whether you may start and what is missing.
