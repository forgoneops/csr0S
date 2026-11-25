---
name: caesar-sweep
description: "Use when reducing, simplifying, or removing existing CAESAR code or content. Characterize first, measure the same scope before and after, and propose deletions rather than applying them."
---

# Sweep

Reduce an existing system without changing its behavior by accident. A sweep is deletion-first, evidence-led, and reversible. The goal is less unnecessary surface area, not a prettier diff or a lower line count at any cost.

## Rules

- Choose one bounded target and state its expected behavior, consumers, and exclusions before editing.
- Inspect the current implementation and its callers. Identify whether another agent has uncommitted work in scope; do not overwrite it.
- Measure a baseline on the exact target before changing it. Use a real command or tool and preserve its output. State the scope and method so the after-measurement is comparable. Do not invent counts or infer measurements from appearances.
- Add or identify characterization tests for behavior that must remain. Run them before cutting. If a behavior is not testable or understood, do not remove its implementation yet; document the uncertainty.
- Search for consumers and duplicate implementations. A symbol with no obvious caller is a candidate, not proof that it is safe to remove.
- Prefer deleting obsolete code, duplicated content, dead branches, and needless indirection over adding abstractions or rewriting working behavior.
- Make small, reversible changes. Do not combine a sweep with unrelated fixes or feature work.
- Re-run the same measurement with the same scope and method. Report before and after values, the difference, commands, and any limitations. A measurement that cannot be reproduced is not evidence.
- Run the relevant characterization tests after the change, plus the narrowest appropriate typecheck/build or integration checks. Report actual output; passing tests do not prove all possible behavior is unchanged.
- Keep a concise record of removed items and why each was safe to remove, tied to tests or other concrete evidence.
- Deletions are proposals only. Do not delete user data, notes, files, records, or other externally meaningful content. Present each proposed deletion with its path/identifier, rationale, evidence, impact, and recovery option. Wait for explicit approval before applying destructive or irreversible deletion. Code edits in the working tree are not permission to delete data or publish changes.
- If the sweep finds a security, data-loss, or production risk, stop that portion and escalate rather than expanding scope.

## Completion report

Include target and exclusions; baseline and after measurements with method; characterization coverage and actual check results; exact proposed deletions; remaining uncertainty; and whether any approval is needed. If no safe deletion is supported by evidence, report that result rather than manufacturing one.
