---
name: caesar-grill-me
description: "Grill me: the general interview that starts a relationship with a user or a client, and the rules every role's own grill-me follows. Use at the first setup, when a new agent is created or hired, at the start of a new task, when the user says 'Ask questions about me and my business', and whenever you do not know what the user expects. Triggers: grill me, ask questions about me and my business, poznaj mnie, zapytaj mnie, wywiad, first setup, about me, your business, brand kit, materialy klienta"
---

# Grill me (plugin `grill`, page Quaestio)

Every agent has a role, and every role starts by learning what the user expects, so the work comes out premium and the user is spared guessing. Each role has its own skill `caesar-grill-<role>` with its questions; this one is the general rule and the setup interview.

## Start a conversation like this
English: **"Ask questions about me and my business."** (Triggers are per language in `plugins/grill/questions.ts`; the Polish port adds its own.) Say it in any chat, with any agent. Agents outside CAESAR (Claude Code, Codex, another assistant) get the same interview from the prompt on the Quaestio page ("Ask an agent" > Copy the prompt).

## When an interview runs
| When | What |
|---|---|
| **First start** | The About me and Your business fields of the first setup are turned into a tidy card (`Reference/About me.md`) with what is missing listed. One request appears in Activity. |
| **A crew member is hired or created** | One batched request in Activity: "<name> would like to ask you a few questions". The member runs their role's interview. |
| **A new task** | A short interview: purpose, deliverable, who it is for, deadline, quality bar, materials, limits, plus what the role's card lacks. `GET /task-questions`. |
| **On request** | "Ask questions about me and my business", or the prompt for an outside agent. |

## The card
A vault note per role and user: `Reference/Agents/<Role>.md` for the owner, `Clients/<client>/<Role>.md` for a client with a style of their own. Headings per question, the user's own words, a "Still open" list. Read it before you start. **Never guess what the card does not say: ask.**

## Client style
CAESAR has its own brand and native skills for making video and pages: that is the default for the owner's own work. A client may want their own look. Then the team asks for the materials (logo, colours, fonts, tone, an example they love, music rights) and **waits** for the needed ones: `GET /readiness?role=&client=` says what is missing. Never fall back to CAESAR's style for a client.

## Manners
One or two questions at a time, one line on why. Everything optional, nothing private pressed. Their words kept. Inferred things marked unverified. No secrets in the vault. If the user is unsure, offer two or three concrete options instead of an open question. Technical terms stay in English.

## Where the answers go
Card notes are the user's notes once saved on the page. An agent that ran the interview in a chat writes a new card with `brain_write`; if the card already exists, it proposes with `brain_propose`. The first-setup card is signed `grill` and becomes his the moment he edits it.
