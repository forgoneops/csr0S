---
name: caesar-harden
description: "Use when hardening or maintaining a CAESAR service, repository, or host. Run real, bounded scans; record risks; leave a rerunnable health check."
---

# Harden

Make a system safer and easier to maintain through measured checks, explicit risks, and repeatable health verification. This is an evidence workflow, not permission to change production or delete data.

## Scope and authority

- Name the target, intended operating boundary, exclusions, and check date before scanning. Prefer read-only inspection and the smallest useful scope.
- Read the relevant handoff, code, and existing operational skills first. Check current git status and preserve other agents' changes.
- Do not inspect secrets, credentials, `.env` files, private keys, or auth stores. Never print sensitive values. Do not weaken security, change access, expose a service, install system software, restart production, publish, or make irreversible changes without the operator's explicit approval.
- Distinguish local/repository findings from live-host observations. Do not imply a live scan ran if it did not.

## Locating the operator's hosts

- Resolve a host named by the operator from `tailscale status` first, before local hostname or SSH-config inspection: his machines are tailnet nodes and the current host may be a different VPS, so local config cannot identify them. Name the node and its tailnet IP in the handoff.
- Reachable is not accessible: `tailscale ssh` can be denied by policy or demand an interactive step-up check only the operator can approve. Do not open that auth link or block the run waiting on it; report the blocker and continue on a path you are already authorized to use.

## Committing in a dirty CAESAR tree

- The checkout routinely holds other agents' uncommitted edits in the same files. Commit only your own hunks: build the index from `git show HEAD:<path>` plus your exact replacements, write it with `git hash-object -w`, and set it with `git update-index --cacheinfo 100644,<hash>,<path>`; leave the working tree untouched. `git commit -- <paths>` commits the whole working-tree file, including another agent's edits.
- Preserve the trailing newline when constructing a staged blob from `git show`; a lost final newline appears as a spurious diff hunk. Read back `git diff --cached -- <path>` before committing, then commit the index without a pathspec.
- Run `bun tools/jev-check.ts '<change-local summary>'` before the commit and respect a `fix` verdict. The gate judges only the report: name what you ran and what passed for this change. Put unrelated suite failures in the handoff and final report, not in that summary, or a healthy change gets returned as unfinished.

## Run real scans

- Choose checks that fit the target: dependency/advisory scan, static analysis, configuration and permission review, exposed-listener inventory, service health, or storage/resource thresholds. Use tools already available and permitted; do not install scanners without approval.
- Record the exact command or tool, target, timestamp, exit status, and observed result. A command that was not run is not a finding. A clean scan means only that the named scan found no reported issue in its scope.
- For each finding, record evidence, affected component, severity, likelihood, impact, and a safe next action. Mark unverified assumptions and false-positive candidates as such; do not silently dismiss them.
- Avoid copying secrets or personal data into reports, logs, the Board, or the Brain.

## Risk register in the Brain

- Search the Brain before creating a register. Read `AGENTS` and the best matching project/operations note; follow the Brain's ownership and write rules.
- Create or extend a clearly titled Brain note for the target's risk register. Keep one risk per entry with identifier/title, evidence and source, severity, likelihood, impact, owner, mitigation, status, and last-checked date. Link the relevant project/runbook notes.
- Separate observed risks from hypotheses and accepted risks. Preserve unresolved items across runs; update status only with new evidence. Do not duplicate another author's note: use `brain_propose` for edits to notes you do not own.

## Rerunnable health check

- Provide a short, non-destructive check procedure that another crew member can repeat. State prerequisites, exact commands, expected healthy signals, thresholds, and what to do when a check fails.
- Store reusable checks with the relevant CAESAR runbook or repository documentation; do not put credentials in scripts. Keep checks bounded and safe to run repeatedly.
- Report actual output and date for each check. A written procedure is not evidence that it was executed; run it once and record the result where permitted.

## VPS care handoff

- For VPS scope, read and follow `caesar-vps-care` before measuring or proposing remediation. `caesar-harden` adds security/risk assessment; it does not replace the VPS runbook or grant authority to clean, delete, restart, or change the host.
- Reuse its read-only measurement and health checks when relevant. Keep host observations, risk-register entries, and proposed actions aligned with the existing thresholds and approval boundaries. Escalate proposed destructive or privileged remediation with exact target, size/impact, rationale, and recovery path; wait for approval.

## Completion report

State target and exclusions; scans actually run with commands, scope, timestamps and results; Brain risk-register path and open/high risks; rerunnable health-check location and observed result; proposed remediations and required approvals; and limitations. Never report a risk as fixed or a system as hardened without rechecking the affected control.
