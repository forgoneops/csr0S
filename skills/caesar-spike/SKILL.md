---
name: caesar-spike
description: "Use when a consequential choice is uncertain and needs a cheap, disposable test. Generate alternatives, expose the riskiest assumption, define a kill criterion, and ask the owner before productionizing."
---

# Spike

Use a short, throwaway experiment to reduce uncertainty before committing to a direction. A spike is evidence for a decision, not a hidden first version of production work.

## Frame the decision

- State the decision to be made, the user or system affected, constraints, and what evidence would change the choice.
- Generate several genuinely distinct approaches before selecting one. Include the simplest viable option and the option that challenges the obvious premise. Do not pad the list with cosmetic variants.
- For each approach, name its expected benefit, cost or trade-off, and the assumption on which it most depends.
- Rank the assumptions by consequence and uncertainty. Choose the riskiest one the spike can test. If the key uncertainty cannot be tested cheaply, say so and recommend a different evidence-gathering step rather than pretending a prototype resolves it.

## Set the experiment before building

- Write a falsifiable question and a measurable pass/fail threshold before running the spike. Define a kill criterion: the observed result that would rule out the approach or stop the experiment.
- Bound time, files, dependencies, data, environment, and permitted tools. Prefer an isolated scratch location or disposable branch/worktree when available; inspect current git status and never overwrite another agent's work.
- Use synthetic or non-sensitive data. Do not inspect or expose secrets, connect to production, publish, spend, install system-wide software, alter user data, or make irreversible changes without explicit operator approval.
- Keep the implementation minimal and disposable. Mark it clearly as a spike; avoid production abstractions, broad refactors, polish, and unrequested cleanup.
- Run the experiment and capture the exact command/tool, scope, timestamp, actual output, and limitations. No tool, no result. Do not invent measurements or claim a result from code that was not executed.

## Decide and cleanly hand off

- Compare the observed result with the threshold and kill criterion. State what the evidence supports, what remains unknown, and whether the original assumption survived. A failed spike is useful evidence; do not massage a miss into a pass.
- Recommend one next action: stop, test another assumption, or prepare a production proposal. A spike does not authorize production implementation.
- Present the alternatives, assumptions, experiment, evidence, recommendation, risks, and any approval needed to the owner. Wait for the owner's explicit gate before turning spike code into production work or making an externally visible or irreversible change.
- Remove disposable artifacts only when their location and ownership are clear and removal is safe; otherwise identify them for review. Never delete user data or another agent's work.
- If the experiment cannot be completed within its boundary, report what ran, the exact blocker, and the remaining uncertainty. Do not imply completion.

## Completion report

Record the decision question; alternatives considered; riskiest assumption and kill criterion; scope and actual experiment; evidence and result; limitations; recommendation; approval gate; and the location/status of any throwaway artifacts.
