# B1 bootstrap: the first running core app (2026-11-22)

Branch `shell/bootstrap`. Nothing deployed, nothing restarted, no `main`, no push to any other remote.
Work folder: a fresh clone of `~/caesaros.git` (`~/caesaros-work`). The legacy repo `~/caesar` was read
for its server core and design tokens and was not modified.

## What exists now

```
core/            server, module registry, auth/principal, audit, settings, events, isolation, packs
web/             React + Vite shell: rail (56 px), flyouts (316 px), dock, system capsule, background
packs/           ds0 icons (54 roles), ds0 type (16 faces, OFL), cinder + lumen themes
tests/           6 files, 23 tests: the gates below
docs/plan/       the register, bridge, build graph (from the skeleton)
```

### Core (ported, not copied wholesale)

| File | What it does | Changed from legacy |
|---|---|---|
| `core/server.ts` | Hono app; health, version, settings, packs, tokens, modules, events, isolation, audit, detect, static web | new settings model, no PIN, no install-script route, no owner routes |
| `core/db.ts` | one SQLite file, namespaced KV | `caesaros.db`, `CAESAROS_DATA` |
| `core/events.ts` | one SSE stream, publish/listen | unchanged behaviour |
| `core/plugin-life.ts` | pause/resume timers, listeners and cleanups per module | unchanged behaviour |
| `core/plugins.ts` | module registry: manifest, `/api/p/<id>/`, enable/disable, edition gate | roots `plugins,owner` (missing roots skipped); `DATA/modules/<id>`; no item types |
| `core/principal.ts` | operator / agent-token / anonymous; private-scope gate; DNS-rebinding host check | **no PIN** (R27); no legacy default agent allow-list |
| `core/audit.ts` | audit rows written before a private read is served | new, small |
| `core/schema.ts` | `Settings` + `PluginManifest` | rebuilt: language, theme/icon/font packs, motion, dock, engine, gateways; no crew/board/Brain/hermes fields |
| `core/sandbox.ts` | bubblewrap view for agent turns, honest status when unavailable | hidden places are the database and backups only |
| `core/packs.ts` | pack discovery, the 54-role contract, URL resolution | new |

`core/` imports nothing from `owner/` and names it only as a module root. `CAESAROS_MODULE_DIRS`
overrides the roots, so a core-only install never lists it.

### Shell (new)

- **D1** — 56 px rail, 316 px flyouts (measured: `rail 56x900`, `flyout 316x230`), groups inside the Apps
  flyout, phone drawer + five-item bottom bar.
- **D2** — the dock is pinned shortcuts: pins from the Apps flyout and from a module row, stored in
  `settings.dock`, unpinned from the flyout or Settings.
- **D3** — one system capsule: live diamond, engine chip (92 px closed, opens in place), Motion as an
  icon-only 44 px control that always carries its word, and a waiting count.
- Icons are asked for by role (`<Icon role="motion" />`); a role the active pack lacks draws a dashed
  fallback with the role in its title. Fonts are applied from the font pack manifest into `@font-face`;
  themes are a stylesheet the pack layer swaps. No component imports an asset (tested).
- EN and PL from day one, in one dictionary file, with a test that the key sets are identical and every
  `t("…")` the shell uses exists in both.
- Empty states are honest: chat says no model is connected, modules say what a module is, a module page
  without a bundled interface says exactly that and can probe its own `/api/p/<id>/` route.
- Background: `web/src/shell/background.ts` is the WebGL/2D field ported from
  `themes/caesaros/background.js`, reading `--accent` and `--signal`. With Motion Off the canvas is
  hidden and no loop starts.

## Gates (real output, 2026-11-22)

| Gate | Command | Result |
|---|---|---|
| install | `bun install` | 30 packages, lockfile written |
| type check | `bunx tsc --noEmit -p .` | clean (no output, exit 0) |
| core build alone | `bun build core/server.ts --target=bun --outdir dist/core` | 153 modules, server.js 251.9 kB, exit 0 |
| web build | `bun ./node_modules/vite/bin/vite.js build web` | 28 modules, 269.6 kB js (82.3 kB gzip), 16.9 kB css |
| core cannot import owner | `bun test tests/core-imports.test.ts` | 4 pass; a planted `import "../owner/leak"` makes 2 fail (checked in a throwaway copy) |
| deleting owner stays green | `bun test tests/core-alone.test.ts` | copies the tree without `owner/`, type-checks, builds core and web there: pass (1.5 s) |
| pack contract | `bun test tests/packs.test.ts` | 54 roles present as symbols; both themes carry `--signal`; 16 faces exist |
| module pipeline | `bun test tests/module-registry.test.ts` | `plugins/hello` discovered, `/api/p/hello` answers, its store counts, off → 404, on → 200, owner module refused in a standard build |
| no direct asset import | `bun test tests/no-direct-assets.test.ts` | pass |
| i18n symmetry | `bun test tests/i18n.test.ts` | pass |
| server runs without owner | `bun test tests/server.test.ts` | health/settings/packs/modules answer; unknown Host → 421 |
| full suite | `bun test tests` | 28 pass, 0 fail, 343 expects |

Screenshots (`docs/design/captures/bootstrap-2026-11-22/`): `1440-chat-full.png`, `390-chat-full.png`,
`1440-chat-off.png`, `390-chat-off.png`, `1440-modules-full.png`, `1440-settings-full.png`,
`390-settings-pl.png`. Captured at exactly 1440x900 and 390x844 with headless Chromium; Motion Off was
set through the real settings API before capture.

Measured in the browser (not eyeballed): at 1440x900 `scrollWidth == 1440`, rail 56, capsule 250x52,
engine chip 92x38; at 390x844 `scrollWidth == 390`, rail `display:none`, five `.bar-item`s, capsule
155x52, engine chip 78x44, no element past the right edge, no clipped text, every `<use>` resolves.

## Served-surface pass (rendered and driven, 2026-11-22)

Everything below was done in a real browser against the running app (`bun core/server.ts` on 4410),
not read from code.

| Surface | Action | Observed |
|---|---|---|
| Chat 1440x900 | load, measure text | h1 57x21 at (128,17); hero 980x263; title 30 px; lede 2 lines of 15/23.25; composer 760x44; hint 12.5 px in `--ink-3`; no overlap between hero, composer, hint |
| Rail | hover/click Apps | flyout **316x230 at (64,64)** (settled, motion off); sections "Talk", "System"; rows "Chat", "Modules"; focus lands on the first row; Escape closes |
| Dock (D2) | pin Chat in the flyout | rail gains one pin; `GET /api/settings` → `dock:["chat"]`; hover the pin opens "Pinned shortcuts" with row "Chat" |
| Capsule (D3) | click engine chip | panel opens with routing tabs Local / Gateway / Offline; choosing Offline makes the chip read "Offline", muted, and the live diamond lose its fill; value persisted (`engine: "offline"`) |
| Theme pack | Settings → Lumen | `data-theme=lumen`, `#theme-pack` → `/packs/themes/lumen/theme.css`, `--accent` `#FF6A2B` → `#37DFF5`; back to Cinder restores it |
| Language | Settings → Polski | title "Ustawienia", first panel "Wygląd", `lang=pl`, persisted; English restores |
| Motion | capsule control | Off: `data-motion=off`, `.bg` `display:none`, `document.getAnimations().length === 0`, word "Off"; On: canvas back |
| Modules | Turn off / on "Hello" | state and button flip, `disabledModules:["hello"]` persisted, `/api/p/hello` **404 while off, 200 when on** |
| Chat 390x844 | load, measure | `scrollWidth 390`; five bar items 78x60; capsule 155x52; chip 78x44; composer 358x100; field 358x44; zero interactive targets under 44x44; lede 3 lines at 292 px width; title 22 px |
| Drawer 390 | open, Escape | sheet 390x218 at the bottom; focus moves to the first row; Escape returns focus to the menu button |
| Dock sheet 390 | tap "Pinned" | 390x184, inside the viewport, row "Chat" |
| Settings 390 | scroll | `scrollWidth 390` while `scrollHeight 1794`, 5 panels, nothing past the right edge, nothing clipped |
| Modules 390 | load | `scrollWidth 390`, one row card, no overflow |

**Defects this pass found and fixed** (they were not visible in a static screenshot):

1. **The engine panel opened off-screen**: it was `position:fixed` inside `.capsule`, which has a
   `backdrop-filter`, so it was positioned against the 92 px capsule (measured `top:-248`, `width:141`).
   Fixed by portalling it to `<body>` and pinning it to the window (`340 px`, right 16; on phones
   `left/right 12`, bottom 80). Now measured `366x194` fully inside 390x844.
2. **The chat field collapsed to 20 px on phones**: `.composer` becomes a column, and `flex:1` on the
   field sets `flex-basis:0` on the vertical axis, overriding `height:44px`. Fixed with
   `flex:0 0 auto`. Now 358x44 — a real touch target.
3. **The engine chip was 34 px tall on phones**, under the 44 px floor. Now 44 px, capsule 52 px.
4. **The drawer never took focus.** It now focuses its first row on open and returns focus to the
   menu button on close (checked: `activeElement` is `icon-btn menu-btn` after Escape).

Screenshots were re-captured after these fixes: `1440-chat-full`, `390-chat-full`, `1440-chat-off`,
`390-chat-off`, `1440-modules-full`, `390-modules-full`, `1440-settings-full`, `390-settings-pl`
(eight files, exact viewports).

## Gaps (what this bootstrap does not do)

1. **Chat does not answer yet.** There is no engine or model registry, so Chat is an honest empty state
   with a disabled composer. R45's clean-user check ("starts and chats with a local model") is not met.
2. **One module ships, one page does not.** `plugins/hello` proves the registry end to end (discovery,
   `/api/p/hello`, its own store, 404 when off, consumer build refuses an owner module). The web app does
   not load a module's `client.tsx` bundles yet, so a module page shows the honest "no page in this
   build" state. A module route answers without a trailing slash (`/api/p/<id>`); with one it is 404,
   same as legacy — decide whether to normalize.
3. **Design verdict is not mine.** Layout was verified by measurement; the look and the panel proportions
   (hero sizes, spacing rhythm) need Agrippa's eye before anything is called finished. Cut corners,
   hovers, focus rings and press feedback are implemented from the DS0 tokens but not reviewed.
4. **Visual QA beyond geometry**: no screen-reader pass, no keyboard-only traversal, no 200% zoom, no
   real device.
5. **`settings.dock` ids** use `<module>/<nav>` for module pages and plain ids for built-in apps; that
   convention needs to be written into the plugin contract before a third owner builds on it.
6. **No PWA, no native shell, no gateway health, no i18n plural forms.**
7. `web/dist` and `data/` are git-ignored; a fresh clone needs `bun install && bun run build`.
