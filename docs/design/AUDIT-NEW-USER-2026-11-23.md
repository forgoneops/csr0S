# Audit as a new user, 2026-11-23 (claude-b)

Method: a throwaway core with an empty data folder and an empty Hermes home on port 4497, driven in a browser at 1440x900 and 390x844 by a person who knows nothing: open the page, press what looks pressable, try to start a chat. Screenshots in /tmp/claude-1000/newuser (not in the repo). This is one reviewer's walkthrough, not a user study; the percentages are my own rating by the rubric below, to be checked by Jev and by a real first-time user. Not yet tested: a real first answer from an engine, screen readers, the measured accessibility numbers (Agrippa's report is pending).

## What a new user sees
1. A splash with the portrait, "CAESAR OS EVOLVE" and "TOUCH TO ENTER". Premium, clear.
2. After one click: the **Start** tab, "FIRST RUN, Set up CaesarOS: A few choices, all optional... change every one later." Three plain questions (name, work, anything else), then "Sign in to your tools" with Claude Code shown as READY. Good tone.
3. Around it: eight workspaces in the top bar (Main, Daily, Content Studio, Web Studio, Dev, Knowledge, Team Ops, System), a left menu with about 40 entries in groups (Talk 4, Day 7, Knowledge 9, Work 9, Make 6, Private data 3, System 13), each with a Latin second name (INCIPIT, TABELLAE, FASTI, VIGILES, AUGURIA, PROPOSITA).
4. On the phone: icon-only top bar, a bottom bar with Home, Apps, Sessions, Chat (good), and the same setup form.

## Findings, worst first
| # | Finding | Why it hurts a newcomer | Fix |
|---|---|---|---|
| 1 | **Demo residue on a clean machine**: a "VPS" chip in the top bar and a menu footer "VPS . SHARED BRAIN . BONSAI 2 27B" although there is no VPS and no such model | The app states things that are not true; trust drops at once | Show only what exists; hide the chip and footer until a gateway or model is connected |
| 2 | **No obvious way to just talk**: the first screen is a form; the chat is two steps away (menu, Talk, Chat). My first message went into the setup form's text box | The first success, a first answer, is the thing newcomers look for | The Start tab opens with a composer on top ("Ask anything") and the setup beside it; the phone Home has Chat as its main button |
| 3 | **Too much at first sight**: eight workspaces and about 40 menu entries before the first use, most of them empty | Nobody knows where to begin; the advanced parts are in the way | Beginner first (rule 6): start with Home, Chat, Notes, Settings; the rest appears when used or under "More" |
| 4 | **Two names for everything**: English plus Latin on every entry | Doubles the reading; the Latin means nothing to most | Show the plain name; the Latin only as a small caption in Visual mode, off in Simple |
| 5 | **Unlabelled icons** in the top right (microphone, alert, pulse) and a status bar line "3 ENGINES ANSWERING" | Unclear what they do or whether something is wrong | Names on hover and focus, one plain sentence in the status line |
| 6 | **No guided tour**: the chibi guide of the old line is not in the new app | A newcomer is left alone; this is the one place the tour pays off | Port the tour as the first-run companion (plan 8.8) |
| 7 | Good: premium look, plain first-run wording, everything optional, phone bottom bar, Ctrl K search shown in the bar | | Keep |

## Rating by rubric (my estimate, percent of a full score)
| Criterion | Weight | Score | Note |
|---|---|---|---|
| First impression and trust | 10 | 90 | strong look; loses points for the false VPS and model labels |
| Honesty of the interface (no demo residue) | 15 | 40 | finding 1 |
| Time to a first answer | 20 | 50 | about 4 steps through the menu; the leaders need 0 to 1 |
| Plain wording | 10 | 60 | good in setup, doubled names elsewhere |
| Progressive disclosure | 15 | 40 | finding 3 |
| First-run guidance | 10 | 60 | good form, no tour |
| Phone | 10 | 65 | bottom bar is right; same overload |
| Accessibility | 10 | not rated | waiting for the measured report |
**Rated criteria: 55 percent (weighted over 90 of 100 points). With the accessibility number added the total will move a few points.** The gap to a senior-approved release on this axis is mostly findings 1 to 3, which are small to fix.
