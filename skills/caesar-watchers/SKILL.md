---
name: caesar-watchers
description: Set up and manage Watchers (Vigiles): rules that watch a page, a file, a time of day or a CAESAR event without spending tokens, and put a change in Activity for the operator's yes. Use when asked to monitor, track, keep an eye on, notify when something changes, or run something every day. Triggers: watcher, obserwuj, monitoruj, daj znac jak sie zmieni, codziennie, rule, reguła.
---

# Watchers (Vigiles)

Page `/watchers` (Day menu). A rule is checked by plain code on a timer: fetch and hash a page, hash a file, compare the clock, hear an event. **No agent runs while it watches.** When it fires, an item appears in Activity (Waiting on you). Approve acknowledges it, or, if the rule has "then ask an agent", starts that agent once with the rule's prompt. Dismiss drops it.

## Triggers
| when | needs | notes |
|---|---|---|
| `url` | an http(s) address | looked at every N minutes (minimum 1), the first look only records; private and local addresses are refused; 2 MB cap |
| `file` | a path under the operator's home | secrets folders (`.ssh`, `.gnupg`, `.aws`, `.config/gh`) are refused; 5 MB cap |
| `daily` | `HH:MM` | fires once a day after that time |
| `event` | `plugin.name` | for example `calendar.due`, `missions.mission` |

## API (operator only)
`GET /api/p/watchers/rules`, `POST /rules {name, when, every?, ask?: {agent, prompt}}`, `POST /rules/:id {enabled}`, `DELETE /rules/:id`, `POST /rules/:id/look` (look now), `GET /log`. At most 40 rules.

## Good rules
- Name what it is for ("Price of X dropped"), not how it works.
- Prefer `daily` or `event` for things you read; use `url` sparingly (every 15 minutes is plenty).
- Put the action in the prompt, one clear sentence, and remember the agent only starts after the operator's yes.
- Never watch a page that needs a login or a private address; say so and ask for another way.

## Limits to tell the operator
The agent start after approval goes through the chat API; with a PIN set on this CAESAR it needs a signed-in session and may answer 401 (shown as a failed approval). Pages that change on every load (ads, timestamps) will fire every time: pick a more stable page.
