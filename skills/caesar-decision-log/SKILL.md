---
name: caesar-decision-log
description: "Use when a design or architecture decision is made, reversed or questioned in CAESAR, or when the operator asks why something was built the way it was, wants a report on a choice, or wants to learn from it. Triggers: decyzja, dlaczego tak, decision log, ADR, raport z decyzji, czego sie nauczyc, odrzucone opcje."
---

# Decision log (`docs/decisions/`)

One short file per decision, numbered `NNN-short-title.md`, index and template in `docs/decisions/README.md`. The operator wants it as a **report and as learning material**, so every file ends with "What to learn".

## Write a decision when
A choice shapes how the system grows: a rule (plugins never import each other), a security stance, a vendor or account policy, a format, something rejected on purpose. Not for every edit.

## Format (all seven parts, short)
Problem · Choice · Rejected (each option with its reason) · Evidence (a commit, test, doc or measurement you can check) · Risk (and what would make us reverse it) · What to learn.

## Rules
1. Evidence or say "not measured". Estimates are labelled estimates. Never invent a source.
2. A reversed decision gets a **new** file that points back; the old one is not rewritten.
3. Update the index line in the README. Durable decisions also belong in the vault (git); live numbers do not (see decision 007).
4. Plain wording, technical names in English, no em dashes in text the operator will publish.
5. Disagreement is welcome with evidence: add it under Risk, do not delete the original reasoning.
