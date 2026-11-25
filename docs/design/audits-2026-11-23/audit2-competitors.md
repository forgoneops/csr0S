# Audit 2, competitor evidence (web, 2026-11-23). Facts are as reported by the sources; unverified items are marked.

## Accessibility (screen readers, keyboard)
- ChatGPT: a manual screen-reader audit flags dialogs (Search Chats, Keyboard Shortcuts) that close on Escape with no announcement; another source notes unlabeled buttons on the website. Source: dev.to/wiscer (ChatGPT manual screen reader audit); help.sunyempire.edu article.
- Claude: a March 2026 audit finds claude.ai usable with a screen reader, but no announcement when a response finishes generating, and the Keyboard Shortcuts dialog is a blocker (only the heading is read). Source: dev.to/wiscer (screen reader experience analysis on claude.ai).
- Gemini: math and symbols are not read by screen readers; no keyboard shortcuts to jump to the chat input, start a new chat or delete the chat; strong TalkBack integration on Android. Source: dev.to/wiscer (Gemini).
- A 2026 study of 30 AI tools (accessibilitychecker.org) says the big labs took accessibility seriously; main complaint: keyboard shortcuts not announced. Per-product scores not confirmed.
- Gaps in the evidence: no vendor WCAG or VPAT statements found; voice mode, Projects and memory accessibility not covered.

## First run and clarity
- Claude: about 3 minutes and 5 to 6 steps to a first meaningful response (one teardown site's estimate; unverified), a three-question personalisation, a pre-written first prompt that removes blank-input hesitation.
- ChatGPT: example prompts and capability hints on first run.
- MeasuringU 2025 usability benchmark: Gemini A-, ChatGPT B, Claude C (perceived ease plus usefulness; overall, not onboarding only).
- NN/g (new AI users onboarding): early users ask the bot what it can do, so first-run guidance about capabilities matters.
- Unverified, do not rely on: "4.7 vs 3.2 on-screen elements" (a page citing NN/g, not confirmed).
