---
name: caesar-atrium-verify
description: "Use before claiming any CaesarOS UI change works: run the real core, drive a real browser, check functions, clipping, motion, console errors, and take screenshots at 1440 and 390. Also: 'zweryfikuj', 'sprawdz w przegladarce', 'screenshot', 'test the UI'."
---

# Verifying a UI change

A UI step is done when a browser run against the **real core** passes. Reading code is not verification.

## Run
```bash
D=$(mktemp -d); CAESAROS_PORT=4481 CAESAROS_DATA=$D bun core/server.ts &     # never 4410: that is the owner's core
```
Playwright and Chromium are already on this machine:
`~/.local/share/mise/installs/playwright/latest` and `~/.cache/ms-playwright/chromium-1254/chrome-linux64/chrome` (pass it as `executablePath`). Open `http://127.0.0.1:4481/?noboot`.

## Check, every time
1. **The function works**: do the user's action and read the result from the page or the API (a real reply, a saved value after reload), not only that a button exists.
2. **No console errors** (`page.on('pageerror')` and error-level console). WebGL "GPU stall" notices are not errors.
3. **No clipped text or overflow**: `documentElement.scrollWidth <= innerWidth`; visible text not cut.
4. **Targets are 44 px** and keyboard focus is visible on cut-corner controls.
5. **Motion**: after an in-page action, zero elements replay an entry animation (`html[data-still]` is set). Motion Off and Reduced are honoured.
6. **Two sizes and two languages**: 1440x900 and 390x844; English and Polish. Desktop and phone have the same functions.
7. **Screenshots**: save to `docs-shots/` (untracked) while working; commit only the few that document a step.

## Pitfalls seen here
- Move the mouse away before clicking: the rail expands on hover and covers content.
- The terminal has a session rate limit; a test that opens it dozens of times gets 429.
- A test that imports the core before setting `CAESAROS_DATA` pollutes the repo's `data/` (tests/setup.ts now prevents it).
- `pkill -f` with a pattern that appears in your own command kills your shell: stop servers by pid (`ss -ltnp | grep :PORT`).
