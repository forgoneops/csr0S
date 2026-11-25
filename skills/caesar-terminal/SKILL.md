---
name: caesar-terminal
description: "Use when the operator wants a terminal or shell inside CAESAR, asks about the Terminal page (Armilla), tmux sessions, or why the terminal refuses to open. Also: 'terminal', 'powloka', 'otworz terminal', 'dlaczego terminal nie dziala'."
---

# Terminal (plugin `terminal`, page `/terminal`)

A shell **as the operator**, kept alive in tmux (`caesar-<id>` sessions), shown with xterm.js. Output arrives as a server-sent stream, keys go back by POST. On a phone, Esc, Tab, Ctrl-C, Ctrl-D, the arrows and Paste are buttons.

## Rules (hard)
1. **Operator only, behind a PIN.** The routes refuse without a PIN set (403) and for anything but the operator's session (401 or 403). Without a PIN the API trusts browser-looking headers that an agent can forge, and a terminal is a shell: never relax this. Rules and tests: `plugins/terminal/sessions.ts`, `tests/terminal-sessions.test.ts`.
2. **Agents never get a terminal.** Do not give an agent a token for these routes, and do not drive the terminal on the operator's behalf. An agent that needs a shell already has one, inside the isolation (`caesar-isolation`).
3. The terminal's shell is the operator's own and is **not** isolated.
4. `tmux` must be installed. A closed session ends the shell for good; leaving the page does not.

## When it will not open
"Set a PIN first": Settings > PIN lock. "tmux is not installed": `pacman -S tmux` (or the platform's package). Two screens attached to one session at the same moment can echo terminal replies as stray characters; clear the line with Ctrl-C.
