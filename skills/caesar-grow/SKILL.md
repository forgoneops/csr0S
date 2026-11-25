---
name: caesar-grow
description: "Use when improving a shipped product against one chosen metric. Start from real data, form ICE-ranked experiments, and turn approved experiments into Board steps."
---

# Grow

Improve a shipped product by learning from real usage and running bounded experiments. Growth is not a license to optimize a proxy, fabricate traction, or change production without approval.

## Choose one outcome

- Name the shipped product, user group, decision owner, and one primary metric for this run. Keep the metric stable through the experiment; do not combine unrelated outcomes into a score.
- Define the metric precisely: numerator, denominator (if any), unit, population, time window, source of truth, and baseline period. State whether higher or lower is better.
- Select a metric connected to a real user or product outcome. Supporting measures may diagnose a result, but they do not replace or silently redefine the primary metric.
- If reliable data or a meaningful baseline is unavailable, say so and propose the smallest safe instrumentation or research step. Do not estimate or invent observed values.

## Reach, Rations, Evidence

For every proposed experiment, record:

- **Reach:** who could encounter it and the measured eligible population or distribution channel. Use a real source and period. If unknown, label it unknown; do not substitute total users or impressions without justification.
- **Rations:** expected cost and required resources, including engineering time, operational load, and any spend. Label estimates as estimates, give their basis, and flag approvals required. Do not spend or install tools without authorization.
- **Evidence:** the observed baseline and its source, sample size or coverage where available, collection window, known limitations, and the signal that would support or reject the hypothesis. Distinguish observed facts from assumptions.

Use only data the operator is authorized to access. Minimize personal data, avoid secrets, and aggregate where individual-level detail is unnecessary. Never claim causation from a before/after change alone when other factors could explain it.

## Form and rank experiments

- Start from a specific observed friction, opportunity, or uncertainty. Cite the source of the observation, such as an analytics report, support pattern, or direct research; mark inference as inference.
- Write each experiment as a falsifiable hypothesis: for which users, what change, expected direction and magnitude (if evidence supports a target), and how the primary metric will be evaluated.
- Define scope, duration or stopping rule, guardrails, risks, dependencies, and a rollback/stop condition before implementation. Keep the smallest safe test; do not expose users to an unapproved or unsafe variant.
- Rank candidates with ICE: Impact, Confidence, Ease, each scored 1–10 with a short evidence-based rationale. State the calculation convention (default: Impact × Confidence × Ease) and show the component scores. The score is a prioritization aid, not evidence or certainty. Do not give false precision; use ranges or mark a score provisional when evidence is weak.
- Keep the ranked list short and explain ties or overrides. A safety, privacy, accessibility, or reliability guardrail can veto a high ICE score.

## Board handoff and authority

- Turn only the selected, review-ready experiment into a proposed CAESAR Board workplan step. Include the metric definition, baseline/source, hypothesis, ICE scores, Reach/Rations/Evidence, scope, guardrails, stop condition, owner, and proof expected.
- Do not create or assign a Board step unless the operator has authorized that action or the current task explicitly grants it. A recommendation or ranked backlog is not authorization to run experiments.
- Implementation, user-facing changes, data collection, production rollout, spending, and external publication require the relevant explicit approval. Never claim a test ran, a metric moved, or an experiment succeeded unless the observed evidence supports it.

## Report

State the single metric and its definition; real baseline and source (or the exact data gap); experiment candidates with ICE components and calculation; Reach, Rations, and Evidence for each; the selected recommendation and why; guardrails and approvals; and what remains unknown. Report actual results separately from forecasts and recommendations.
