# Audit 2: clarity and accessibility of the new app, measured

Date: 2026-11-23. Target: **the Atrium** (`web/atrium/`, the new frame that `core/server.ts` serves when
`web/dist` is absent; the same app `tools/readiness.ts` drives). Throwaway core on **port 4493**,
`CAESAROS_DATA=$(mktemp -d)`, Chromium via the npx `playwright-core` copy at **1440x900** and **390x844**
(mobile emulation, touch). No repo file was edited. axe-core is **not installed**, so every number below
comes from scripted DOM measurement in the page (accessible-name approximation, AX roles, computed styles,
`document.getAnimations()`).

Additions made only to the throwaway instance so the flow could be measured honestly: one OpenAI-compatible
model server pointed at a local fake on port 4494 (so a first message can actually be sent without spending
an agent account) and `setupDone=false` to get the first-run page. Raw data: `/tmp/claude-1000/audits/a2/*.json`.

## Worst first

| # | Check | Measurement | Page / screen | Failing elements |
|---|---|---|---|---|
| 1 | Keyboard on the phone | **25 of the first 40 Tab stops are off-screen**: the rail carries `transform: translateX(-300px)` at 390px but its buttons stay in the Tab order; focus lands at x=-300 and nothing visible moves | every 390px view | `.ns-gh`, `.ns-it` (Engines, Theme, Settings, Mobile app …), 25 stops at x<0 before the first in-view control |
| 2 | Empty states: apps that have no page | **2 of 54 apps render a placeholder**: text "This app opens here in its own tab in the product. It is not part of the prototype." with **0 buttons** and no next step | Projects, Approvals | `.nx-view` body only |
| 3 | Accessible names of switches | **7 `role=switch` spans with no accessible name** (no `aria-label`, no `aria-labelledby`, no text): a screen reader says only "switch, on" | Watchers, Devices, Fleet | `<span class="og-sw" role="switch" aria-checked tabindex="0" data-rd="…">` — Watchers 3 (`wtog:stale/backup/today`), Devices 2 (`visible`, `discover`), Fleet 2 (same) |
| 4 | Accessible names of inputs | **6 form fields named by placeholder only** (5 `<textarea>` + 1 `<input type=date>`); placeholders vanish on typing and are not a reliable name. The chat composer is the same: `#inp` textarea, placeholder only | Settings, Vault, Library, Command, Clipboard, Meetings; Chat | `#rd-rnote` (report a problem), `#rd-vnew` (Vault secret), `#rd-ktext`, `#rd-pbody`, `#rd-clip`, `#rd-mdate`, chat `#inp` |
| 5 | Keyboard reach of apps | Apps inside a **collapsed group are not in the Tab order**: **36 Tab presses** to the "Knowledge" header, then Enter, then the item; from a clean load the first rail button is Tab stop **20**, Board **29**, Settings **43**. The Search app (`Quaero`) is **not reachable at all** without opening its group first | all | `.ns-gl:not(.open)` holds **40** focusable buttons that are `display:none` |
| 6 | Tap targets at 390px | **20 controls under 44px across 6 views** (0 on Home), of which **10 are under 24px wide** (WCAG 2.5.8 minimum): every open tab's close button is **10x44px**, the new-tab "+" is **42x46** | Home 0/42, Chat 2/50, Notes 3/50, Settings 4/61, Board 5/53, Crew 6/57 | `button` "×" 10x44 (one per open tab), `button.nx-tab` "＋" 42x46 |
| 7 | Document language, title, headings | `lang=en` ✓, `<title>CaesarOS</title>` ✓ but **never changes per view**; app views start at **h2 with no h1**; Home runs h1→h2→h3→h3→**h2** (dock heading after h3); **Settings jumps h2→h4** | Settings, Notes, Board, Crew, Chat | `<h2>SETTINGS</h2>` then `<h4>Owner password</h4>`; `<h2>NOTES</h2>` with no h1 |
| 8 | Reduced motion | With OS `prefers-reduced-motion: reduce`, **1 animation is still running**: `neosweep` on `div.atrium-top` (9s linear infinite). 48 `prefers-reduced-motion` blocks exist, but that one rule is guarded only by `html[data-motion=on]`, i.e. the app's own switch, which **does** stop it (0 running after Motion off) | every view (top bar) | `neo.css:41` `animation:neosweep 9s linear infinite` |
| 9 | Empty states: do they say what to do next | **Mixed.** Notes: "No notes yet" + "Select a note, or create a new one." ✓ but **two identical "New note" buttons**. Board: **three times "Nothing here."** and no sentence saying to add a task (only the input). Chat picker with an empty crew: **the whole "The crew" section is missing, no explanation** (`/api/crew` returns `[]`) | Notes, Board, Chat | `.nx-view` copy; `#rd-btitle` is the only hint; Chat picker shows only "Coding tools" |
| 10 | Menu size and depth | **7 top-level groups** (Talk 4, Day 7, Knowledge 9, Work 9, Make 6, Private Data 3, System 13 = **51 apps**), plus **8 rail chrome entries**, **18 top-bar buttons**, **10 dock buttons**. Depth: **Settings 1 click**, **Notes 2 clicks** (open Knowledge, then Memory), **crew chat: not available** — no crew profiles exist on a fresh core and the picker has no empty state | rail, dock, top bar | n/a |

## Passes, with the numbers

| # | Check | Measurement |
|---|---|---|
| 1 | Landmarks | 1 `<main>`, 3 `<nav>` (ws-bar, dock, `role=navigation aria-label="Main"`), rail `<aside aria-label="Primary navigation">`, 1 `<header>` on Home. **2 of 3 navs carry no label** (minor) |
| 2 | Images | **0 of 0 `<img>` without `alt`** across all 54 apps (every decorative image already has `alt=""`) |
| 2 | Named controls | **14 unnamed of 6,218 visible controls** across 54 apps (7 unnamed switches in row 3 plus 6–7 placeholder-only fields in row 4; a repeat sweep found 13 — the same set, one field rendering late); everything else has text, `aria-label` or `title` |
| 3 | Tap targets, Home | **0 under 44px of 42 controls** at 390px; no horizontal overflow (`scrollWidth 390 = innerWidth 390`) |
| 4 | Keyboard | **Ctrl+K palette works**: opens, focuses `#nxq`, **40 results**, typing "notes" narrows to **1**, Esc closes. **Enter on a focused rail button opens the view** (Board, Settings, Crew, Notes all reached). **Visible focus on 30/30 stops** (2px solid outline). No skip link exists in any file (`skip to`/`skip-link` absent); the Ctrl+K palette is the shortcut |
| 5 | Contrast, body text | **min 8.23:1** (CaesarOS), **8.01:1** (Neutral), n=52/56 samples, **0 under 4.5:1** |
| 5 | Contrast, muted text | **min 7.87:1** (CaesarOS), **7.38:1** (Neutral), n=66/65, **0 under 4.5:1** |
| 5 | Contrast, chips | **min 8.39:1** (CaesarOS), **8.02:1** (Neutral); chips are 9px but legible, **0 under 4.5:1** |
| 6 | Text size | Range **85–140%**, step **5**, root **16px → 22.4px** at 140%; **no horizontal overflow** at 390 or 1440; **1 clipped element** at 140% (the tab strip, which scrolls by design); nothing else clipped on Home/Notes/Board/Settings |
| 8 | First message | **4 clicks** from first paint: Finish → Chat → pick target → Send (typing not counted); reply arrived and rendered |
| 9 | Menus opening | rail groups 7, apps 51, chrome 8, top bar 18, dock 10 |

## Method and limits

- Accessible names come from `aria-label` → `aria-labelledby` → inner text → `title` → `<label>` → `alt`.
  Placeholder text is reported separately, never as a name. Chrome may fall back to placeholder text; other
  engines and screen readers do not, so rows 3–4 stand.
- Contrast is computed from the computed `color` and the composited ancestor `background-color`, with the
  `--bg` token as the base when the body has only a gradient. **Text drawn over the art/hero images or the
  glass background is not measured** — that is the one place a real screen reader user could still hit a
  contrast problem.
- All measurements were on a **fresh data dir**: crew, chats, notes, projects are empty by design. Numbers for
  populated pages (a crew chat, a filled Board) are not in this report.
- The phone keyboard result is Chromium's Tab order over an off-canvas element; a real touch user does not
  tab, but a keyboard, switch or screen-reader user on a phone-sized window does.
