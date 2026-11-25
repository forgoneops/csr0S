---
name: caesar-brain-onboarding
description: "Use when the operator asks to be interviewed, to set up their profile, goals, business, projects, people, daily routine or recurring jobs in the second brain, or when the vault is new and has no notes about them. Triggers: interview me, zapytaj mnie, onboarding, wywiad, cele, goals, o mnie, about me, my business, moja rutyna, daily routine, setup my vault, jobs."
---

# The vault interview (plugin `brain`, Tabularium > Curator > "Tell the vault about you")

Goal: the vault knows who the operator is and what they are building, in a form CAESAR's own functions read: the daily brief, daily notes, goals (Acta), projects, people, recurring jobs. `GET /api/p/brain/onboarding` returns the topics, where each answer goes, and which are already answered. Start there; do not ask about a topic that is answered unless asked.

## Manners (these matter more than the questions)
- **One topic at a time.** Before each, say in one line why it helps. Then ask, conversationally, one or two questions, not a form.
- **Everything is optional.** If they hesitate or skip, move on and leave the note out. Never press for personal detail (health, beliefs, family) and do not ask for it unprompted.
- Write in the operator's voice, first person, from what they said. Keep their words for names, numbers and decisions. Mark anything you inferred "unverified".
- No secrets in the vault: no passwords, keys, card numbers. If they say one, do not write it; tell them where it belongs.
- Technical terms stay in English (pipeline stays pipeline); the rest in the language they speak.

## Topics and where they go
| Topic | Note | Feeds |
|---|---|---|
| Who you are | `Reference/About me` | every agent briefing |
| Business and projects | `Projects/<name>`, one each: goal, status (top line), next step, people, links | daily brief, goals, Acta |
| Goals | `Reference/Goals`: what you are building toward, what winning means, this quarter | goals in Acta, daily brief |
| People who matter | `People/<Name>`: who, what they care about, what was promised | mail, calendar, meetings |
| Your day | `Reference/Daily routine`: when you work, rest, want to be told things | daily brief, daily notes |
| How you work with AI | `Reference/How I work with AI`: tone, how direct, what never | every agent briefing |
| Jobs you repeat | `Jobs/<job>`: one instruction line, then "Read first" with `[[links]]` to the notes that job needs | `brain_prime` |

## How to write
1. Search first (`brain_search`); extend an existing note instead of making a near copy.
2. Link what you can: `[[People/Name]]`, `[[Projects/Name]]`. A note with no links is an orphan.
3. Write with `brain_write` if you have write access; otherwise `brain_propose kind=write` with a `why`.
4. For a goal that should be tracked, also tell the operator it can become a tracked goal in Acta (do not create it for them unasked).
5. After each topic, say what you wrote and where, in one line.
