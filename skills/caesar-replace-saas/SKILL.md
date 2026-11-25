---
name: caesar-replace-saas
description: "Use when the operator names a SaaS that annoys them and wants CAESAR to have that function. Checks whether an own version is feasible against the reference site, then plans a small plugin in CAESAR's own style. Behaviour only, never the look."
---

# Replacing a SaaS with a CAESAR plugin

CAESAR should have the functions of the SaaS the operator is tired of: notes, meeting notes, dictation, booking, mail and calendar clients. One at a time, only when asked, each as a plugin.

## Steps
1. **Name it and its annoyance.** What exactly is poor: price, speed, lock-in, missing function?
2. **Check feasibility** on `https://canivibecodeit.com/<name>` (for example `/notion`, `/granola`). It gives a verdict (YES, KINDA, NOT REALLY), what is easy and what the moats are. It is a reference for functions, not proof: verdicts are drafted by a bot, claims are unverified, a missing page means it is not listed (free products often are). Never guess a verdict.
3. **Write a row** in `docs/research/SAAS-REFERENCE-<date>.md` (see the existing table): verdict, price, easy, moats, what CAESAR already has, our plan.
4. **Look for open-source versions for ideas only.** Record the licence. AGPL or any copyleft code is never copied into CAESAR.
5. **Plan the first cut small.** Say which moats we skip, which we already solve (the server is the one copy, the Brain is the AI context) and which a PWA cannot do (global hotkeys, background phone tasks): tell the operator plainly.
6. **Behaviour, never the look, and never the name.** The tool gets its own name (a plain label and a name in CAESAR's world); propose two or three to the operator before any code uses one. The studied product's name stays in the research table.
   Also: CAESAR's own layout, names, words and colours; tokens only; a category (not a new top-level tab); closable popups; its own header scene.
7. **Handshake first.** Tell the operator what you understood and wait for the yes before building.
8. **Ship with its skill** `caesar-<name>` and a test; report what is still missing.

## Source
Table of results so far: `docs/research/SAAS-REFERENCE-2026-11-03.md`. Rules: `docs/handoff/25-NIGHTLY-BRIEF-2026-11-03.md`.
