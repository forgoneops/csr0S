---
name: caesar-findings
description: "Findings: after every run of a repeatable workflow (a reel, a post, a report, a research job), record what it taught, and before the next run read what the earlier runs taught. This is how work gets better each time without the user doing anything. Use at the start and the end of any repeatable work. Triggers: findings, ustalenia, czego sie nauczylismy, po przebiegu, przed nastepnym razem, retrospektywa, lessons learned, co zadzialalo"
---

# Findings

The idea: the vault is a backend that feeds the owner, not a shelf he has to stock. Each repeatable workflow keeps one note, `Findings/<workflow>.md`, one dated line per lesson. The agent reads it before the next run and adds to it after. Every run starts from everything learned before.

## Before a run
`brain_prime("<the job>")` already loads `Findings/<job>.md` (the last 25 lines) after the job note and what it links to. Without a job note, `brain_read("Findings/<workflow>")`. Use it: do not repeat what failed, repeat what worked, aim at the numbers.

## After a run: `brain_finding`
`brain_finding { workflow, kind, text }`, one line each:
- **worked**: what you would do again (a hook, a cut, a wording, a source).
- **failed**: what to avoid, and why you think it failed.
- **numbers**: real results with their source (views, replies, minutes, cost). Numbers come from the source (the platform, the file), **never from memory**, and never invented. If the operator supplied them, say so.
- **next**: one thing to try on the next run.
Two to four lines is enough. Plain words, dated by the tool and signed with your name.

## Where it applies
- `caesar-video`: which hook held attention, which cut dragged, the real view numbers when the user gives them.
- `caesar-social`: which posts landed, which channel, which hour; replies only as the user reports them.
- The curator and research jobs: which sources paid off, which were noise.
- Any recurring job in `Jobs/`: link its findings note from the job note so priming loads it.

## Manners
Never write secrets or a client's private data. If the note is the owner's (he edited it) you cannot append: `brain_propose` the line. The findings note is an agent note until he touches it.
