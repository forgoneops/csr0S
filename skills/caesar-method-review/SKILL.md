---
name: caesar-method-review
description: "Use when a piece of work is finished and needs review, or when review comments arrive: a two-step review (does it do what was asked, then is the code good) by someone other than the author, and how to answer feedback."
---

# Review, and answering review


**Asking for a review.** The reviewer is not the author. Give them: what was asked (plan row or spec), the commit range, how to run the checks, and what you did not verify. A crew member or second agent is the reviewer; the author never grades their own work.

**Two steps, in this order.**
1. *Spec check:* does the change do exactly what was asked, nothing missing and nothing extra? Compare against the plan row line by line.
2. *Quality check:* tests that fail without the change, clear names, no duplicated logic, errors handled at the edges, no leaked data, desktop and phone both fine.

**Findings** carry severity (blocks, should fix, nit), the file and line, the evidence, and the fix. A finding without evidence is a guess; say so or leave it out.

**Receiving feedback.**
- Read all of it before reacting. Check each point against the code, not against your feelings.
- Right: fix it and say what changed. Wrong or unclear: say why with evidence, or ask one precise question. Never agree to something you did not understand.
- Fix one finding at a time, run the checks after each, and re-ask the reviewer to look at what changed.

**Finish.** Merge or hand over only after the checks are green (`caesar-method-verify`). Merging to main, deploying and anything outward still need the owner's yes.
