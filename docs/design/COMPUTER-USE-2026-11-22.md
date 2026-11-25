# Computer control (2026-11-22)

CAESAR's own computer-control layer for this Wayland (Hyprland) machine. It replaces Hermes'
`computer_use` for one-shot runs, which cannot see our display because a non-session process has no
`WAYLAND_DISPLAY` / `HYPRLAND_INSTANCE_SIGNATURE`.

Core: `core/computer.ts`. Routes are registered in `core/server.ts` with one line:
`computerApi(app, (c) => access.principal(c).kind === "operator")`.
Tests: `tests/computer.test.ts` (no display needed).

## What exists

The module is a set of pure helpers plus one instance created at import (`createComputer()`):

| Piece | What it does |
|---|---|
| `discoverSession(runtimeDir, ls?)` | Finds `wayland-N` and the single instance folder in `<runtime>/hypr`; returns `XDG_RUNTIME_DIR`, `WAYLAND_DISPLAY`, `HYPRLAND_INSTANCE_SIGNATURE`. Never hard-coded: called on every request. |
| `createArmed(now?)` | In-memory arm state, default off, TTL 1..900 s (default 300), expires by clock. |
| `looksLikeSecret({class,title})` | Matches password/passphrase/sudo/1password/bitwarden/keepassxc/polkit/gpg/pinentry/login. |
| `auditLine` / `appendAudit` / `readAudit` | One JSON line per call to `data/computer-audit.jsonl`; reads the last 100. |
| `parseCombo` / `comboArgs` | `ctrl+shift+t` → `wtype -M ctrl -M shift -k t -m shift -m ctrl`. Allow-listed keysyms only. |
| `pngSize` | Reads width/height from the PNG IHDR header (no dependency). |
| `createComputer({exec, env, data, now})` | The runner. Every command goes through `exec`, so tests inject a fake. |

## Calls

All calls require the caller to be the operator **and** connected from loopback (403 otherwise).
All action calls require armed state (409 `{error:"not_armed"}` otherwise).

| Route | Does |
|---|---|
| `POST /api/computer/arm` `{on, ttlSeconds?}` | Arms (`on:true`, TTL ≤ 900 s) or disarms. Returns `{armed, until}`. |
| `POST /api/computer/stop` | Disarms immediately and aborts an in-flight `wtype` (`AbortController` → `SIGTERM`). |
| `GET /api/computer/windows` | `hyprctl clients -j`, trimmed to address/class/title/pid/geometry/workspace. |
| `GET /api/computer/active` | `hyprctl activewindow -j` or `null`. |
| `GET /api/computer/cursor` | `hyprctl cursorpos` → `{x,y}`. |
| `POST /api/computer/focus` `{address}` | Focuses by address, re-reads `activewindow`, 409 `focus_failed` if it did not land. |
| `POST /api/computer/type` `{address, text}` | Focus + verify + secret check, then `wtype -- <text>`. ≤ 2000 chars. Text is never logged, only its length. |
| `POST /api/computer/keys` `{address, combo}` | Focus + verify + secret check, then `wtype -M … -k …`. |
| `POST /api/computer/screenshot` `{window?|region?}` | `grim -g` over the window rectangle or region; longest side ≤ 1920 (re-shot with `-s` when the first shot is bigger). Returns `image/png`. |
| `GET /api/computer/audit` | Last 100 audit lines. Not armed-gated, so the log stays readable after a stop. |
| `POST /api/computer/click` | Always 501: `pointer injection needs uinput access; see plan 3.4d`. |

Typing and keys are refused if the target's class or title looks like a secret prompt (409
`secret_field`). They also refuse an address that does not exist (409 `focus_failed`) — never type
into whatever happens to be focused.

## Limits

- **No pointer clicks.** `/dev/uinput` is root-only and `ydotool` is not installed. Plan 3.4d.
- **Keyboard only through `wtype`** — a virtual-keyboard protocol client. It needs the compositor to
  accept `zwp_virtual_keyboard_v1`; it works on Hyprland here.
- **One compositor.** Hyprland only; no GNOME/KDE path.
- **Scratch windows only for testing.** The developer test used one `foot` window (`-a caesar-scratch`)
  and closed it by address. No other window was focused, typed into, launched or closed.
- **`grim` sees the screen, not a window's buffer.** The window rectangle is re-read at request time;
  a window that moves between the read and the shot can be clipped.
- **No screenshot retention.** `grim` writes to a temp file, the bytes are read, the file is deleted.

## What worked on Hyprland 0.56.2 (verified live)

```
hyprctl clients -j
hyprctl activewindow -j
hyprctl cursorpos                      # "640, 373"
hyprctl dispatch 'hl.dsp.focus({window="address:0x55…"})'
```

0.56 is Lua-based: the old `hyprctl dispatch focuswindow address:0x…` is **rejected**
(`')' expected near 'address'`). Working selectors for `focus`: `{direction=…}`, `{monitor=…}`,
`{window=…}`, `{urgent_or_last=…}`, `{last=…}`; `window` takes the same `address:` / `class:` /
`title:` selectors. `hl.dsp.window.close({window="address:0x…"})` closes a window.

`grim -s <factor>` is **absolute against the logical geometry** (not relative to the monitor scale):
`grim -g "0,0 400x300" -s 0.5` → 200×150. The 1920 cap is therefore computed from the first shot's
real pixel width.

## Off Grid Desktop versus us

Off Grid (for orientation only) also runs inside the user's session and drives the real compositor.
It captures the focused window by its rectangle, re-checks focus before and after and discards the
shot if focus moved, and activates a window by address before sending keys. We do the same on the
keyboard path: address-only target, focus by address, `activewindow` must match before `wtype` runs.
Differences: we add an explicit armed state with a TTL and a stop that kills in-flight typing, a
secret-prompt refusal, and a JSONL audit of every call. Off Grid ships its own capture/input tooling;
we call `grim`, `hyprctl` and `wtype` directly and add no dependency.
