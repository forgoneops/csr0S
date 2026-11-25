# Plan after the promo: build the native app and the new system

Author: Primus (claude-a) for Konrad and the crew, 2026-11-21. Supersedes nothing: it sits on top of `SHELL-REBUILD-PLAN-2026-11-21.md`, `M11-HERMES-MARKETPLACE-AND-SKILLS-2026-11-21.md` and `docs/design/audits/SYNTHESIS.md`, and replaces only the order and the decisions that Konrad changed today. The requirement register `BUILD-REGISTER-2026-11-21.md` (41 requirements, each with a step, a test and a status) is the authority for "is it done"; `bun tools/plan-check.ts` guards it. Crew build runs only after the promo run (`V3-PLAN-AND-SCENARIO-2026-11-21.md`) has delivered, because capacity is shared.

## 1. What Konrad decided on 2026-11-21 (his words, in the session)
| Decision | Effect on the build |
|---|---|
| Product line: **desktop app for Linux**, **web app** like Hermes Desktop's, **PWA now**, **native mobile later** | one web code base; native Linux app wraps it; PWA hardened now; native mobile out of scope |
| Direction: Roman soul in a Blade Runner / Altered Carbon world, holo glass, premium, complex, pleasant, easy | new skin "NEO ROMA" becomes the real theme (tokens in `neo.css`) |
| Colours: default **ember + cyan**; palette switchable later | two driving colours (`--p1`, `--p2`) + picker in Settings; the WebGL background follows `--accent` / `--signal` |
| Logo and every Caesar mark: the **new Caesar avatar**; scar **ember**, crystal **cyan** | replace `/art/mark.webp` uses; recolour or regenerate Caesar art properly (Agrippa + Codex) |
| Left menu as a **hologram**; art may be holographic too; engine switch (Local / VPS / Offline) collapses to a chip that **opens in place on hover like the dock** | material token for floating surfaces; engine chip component |
| Terminal as **bottom pane, right side dock and tab** | one terminal pane, three placements (Hermes Desktop pane model) |
| Behaviours of Off Grid AI Desktop merged with Caesar's functions | Engines, Start, Settings cards, Split, Integrations, Private Data as in the prototype |
| Hermes fully inside, marketplace included | M11 |
Still open (need Konrad, see section 8): rail shape, dock role, Motion button place, Offline ship or hide.

## 2. Honest checks that change the plan (verified today on this machine)
- **Hermes Desktop is Electron** (`apps/desktop/package.json`: `electron 44.9.3`, `electron-builder`), not Tauri. Our earlier plan said Tauri (M8). Our UI is heavy on WebGL, `backdrop-filter` blur and clip-path. WebKitGTK (Tauri's engine on Linux, `webkit2gtk-4.1 2.54.1` is installed) is usually slower and flakier on those than Chromium, and Konrad's session is Wayland on Hyprland 0.56.2 where global shortcuts, tray and always-on-top overlays behave differently per toolkit. **So the first native task is a spike, not a build** (N0). Rust and cargo are installed, so a Tauri spike costs a day.
- The prototype has **16 infinite animations in Full**, 46 targets under 32 px and one unidentified 404 (`FRONTEND-CHECK-2026-11-21.md`); Vitruvius delivered a patch note for them (`PATCH-VITRUVIUS-MOTION-TARGETS`, on the VPS). Fix them in the real build, not in the prototype.
- Crew models are `deepseek/deepseek-v4.1-flash-1017` on the VPS until Codex resets (about 23:58, in roughly 53 hours); `plugins/agents/crew.ts` (lines 191, 299) still says luna is the default and must be updated when the change stays.

## 3. Two tracks (can run in parallel, one owner each)
### Track N: the native Linux app
| Step | What | Owner | Done when |
|---|---|---|---|
| **N0 Spike** (1 to 2 days) | The same prototype page in (a) Tauri on webkit2gtk, (b) Electron (Hermes Desktop's stack), (c) plain Chromium `--app`. Measure on the Lenovo under Hyprland: idle CPU and RAM, FPS with the WebGL background and holo blur on, window resize smoothness, global shortcut, tray, always-on-top click-through overlay, X11 fallback. | Vitruvius, An for packaging view | table with numbers; recommendation; **Konrad picks the engine** (gate N-G0) |
| N1 Skeleton | Window with saved state, loads the VPS URL or a local server, connection picker (gateway registry), offline page, single instance, deep links, safe external links (guest content never opens the OS browser by itself) | Vitruvius | opens, reconnects, no second UI |
| N2 Native extras | tray (hide to tray, off by default), global shortcut, native notifications from the notify plugin, autostart, file picker, clipboard | Vitruvius | each works on Hyprland and X11 |
| N3 Caesar HUD | Hologram overlay: composer on top, transcript hanging below, portrait with crystal glow, click-through areas; Wayland path by layer-shell or a Quickshell panel decided by the N0 spike | Vitruvius + Agrippa | opens over another app, keyboard focus rules |
| N4 Local gateway and devices | Start, stop and health of a local CAESAR / Hermes; the Lenovo node tools (allowlisted, audited, no shell, offline queue) | Annona + Vitruvius | "This device" shows in Gateways with the HTTP and WebSocket legs green |
| N5 Packaging | AppImage, `.deb`, Arch PKGBUILD for Omarchy, no auto-update until Konrad says; checksums; reproducible build notes | Annona | install and uninstall tested on a clean user |
| N6 QA matrix | Hyprland and X11, 1x and 2x scale, motion Full and Off, 8 hours idle (leak check), battery | Varro | report with screenshots |

### Track S: the system (maps to the old M numbers)
| Step | What | Owner | Notes |
|---|---|---|---|
| S0 Theme | Real `themes/caesaros` gets the NEO ROMA skin: tokens `--p1 --p2` and gold, holo-glass material (one definition for floating surfaces), meander band, Roman numerals, palette picker, logo and mark swap, WebGL reads `--accent`/`--signal`; Classic stays | Agrippa (look), Vitruvius | prototype `neo.css`, `ns.css` are the spec |
| S1 Frame (old M1) | Hybrid shell: slim rail, Apps flyout with the seven groups, Sessions, tabs on demand, View switch reachable, phone drawer and 5-item bottom bar; engine chip in the top bar | Vitruvius | rail shape per decision D1 |
| S2 Engines and Settings | `settings.engines` (job class to engine plus fallback) read by the dispatcher; cards in Settings; Start page; first run; Local never breaks Claude Code, Codex or Hermes (Annona's five call sites) | Annona + Vitruvius | Offline stays hidden until enforced (decision D4) |
| S3 Chat as tab, approvals, instruments (old M2) | unchanged from the shell plan | Vitruvius | after the chat fixes of lane A |
| S4 Terminal pane (old M3, revised) | one terminal host mounted at the shell root, placements bottom, right side, tab, kept alive when hidden; zone model like Hermes Desktop's pane shell | Vitruvius | the prototype `index.html` terminal code is the behaviour spec |
| S5 Gateways and devices (old M5) | Devices page, gateway registry, approvals routed to the owner's backend, the phone sees the same sessions | Vitruvius + Annona | needs sign-in decision D5 |
| S6 Hermes and marketplace (M11) | Skills hub, plugin install through Hermes with the approval card | Vitruvius + Varro | owner edition only |
| S7 PWA (old M9) | install prompt, offline shell, push end to end, safe areas, 48 px targets | Vitruvius | Konrad tests on the iPhone |
| S8 Hardening (old M10) | `caesar-break-ui`, `caesar-ui-review`, `caesar-review-animations` and `caesar-animation-performance` passes; motion budget (at most one ambient loop per surface); targets at least 44 px; axe and Lighthouse; client-edition leak check; docs | Varro + Cd + An | release gates need Konrad's yes |

## 4. Order
```
promo run (now) -> N0 spike + S0 theme (parallel)
N0 gate (Konrad picks engine) -> N1 -> N2 -> N3 -> N5 -> N6
S0 -> S1 -> S2 -> S3 -> S4 -> S5 -> S6 ; S7 after S1 ; S8 last
N4 starts after S5 begins (needs the gateway registry)
```
Capacity rule (unchanged): at most two heavy runs at once, check `GET /api/p/claude-bridge/accounts` before dev work, no deploy or restart while `crew-run status` shows runs, review with a second pair of eyes (Codex when its limit resets, otherwise a different crew member).

## 5. Process (non-negotiable, from the shell plan)
Branches `shell/<step>` and `native/<step>` off `main`; explicit paths in commits; one writer to `main` through `ship`; no force; no client update or release without Konrad's yes each time; needs from Konrad as a CAESAR notification (`POST /api/p/notify/announce`). Every step ends with evidence: screenshots at 390x844 and 1440x900 (motion Full and Off), tests, build, console and network clean, a logged run. Do not lose complexity (B0 checklist in `PLAN-ORDER-OF-WORK`). Never copy another product's code (Off Grid is AGPL); behaviours only, authors credited.

## 6. First tasks to dispatch (ready to paste to Caesar)
1. **N0 spike** (Vitruvius): "Build three throwaway wrappers of `docs/design/prototype/caesaros-new/index.html` (Tauri/webkit2gtk, Electron, Chromium --app) in `/tmp`, measure the listed numbers on the Lenovo under Hyprland and write `docs/plan/N0-NATIVE-ENGINE-SPIKE-2026-11-21.md` with a table and a recommendation. No repo changes."
2. **S0 theme** (Agrippa then Vitruvius): "Port `neo.css` tokens and the holo-glass material into `themes/caesaros` as a skin with two driving colours and a picker; keep Classic; write the token table; screenshots in both modes."
3. **Caesar art** (Agrippa + Codex): "Regenerate or recolour Caesar art with ember scar and cyan crystal: hero banner, chat avatar, crew strip Caesar entry; keep the trademark glow."
4. **Motion and targets** (Vitruvius): "Apply the patch note: at most one ambient loop per surface in Full, every shell button at least 44 px, identify the 404."
5. **Decisions memo** (Caesar to Konrad): the questions in section 8 as one CAESAR notification.

## 7. Risks
| Risk | Reduction |
|---|---|
| WebKitGTK too slow for WebGL and blur | N0 measures it first; fall back to Electron or Chromium `--app` |
| Wayland overlay and global shortcut limits | N3 starts with a spike; fallback is a normal window plus a Quickshell panel |
| Native work rewrites the web app | rule: native only adds what a browser cannot; one web code base |
| Capacity (Codex limit, two Claude accounts) | models on VPS are deepseek flash for now; two heavy runs at most; Codex review after it resets |
| Scope creep during build | additions go to the backlog; this plan is the scope |

## 8. Decisions for Konrad (only these block work)
- **D0 Native engine** after N0: Tauri, Electron or Chromium `--app` (Konrad decides from the numbers).
- **D1 Rail shape: DECIDED 2026-11-22 (Konrad): slim 56 px rail with 316 px flyouts (option A), holo glass look on the flyout, no hover-only behaviour.**
- **D2 Dock: DECIDED 2026-11-22 (Konrad): dock = your own pinned shortcuts.**
- **D3 Motion: DECIDED 2026-11-22 (Konrad): one collapsible system capsule with the engine chip.**
- **D4 Offline:** hide until enforced, or ship the switch now.
- **D5 Sign-in off loopback: DECIDED 2026-11-22 (Konrad): stay tailnet-only. Public standalone web (passkey + QR pairing) is a later step, not in the first release.**

## 9. Quality gates: how it works flawlessly (every step, no exceptions)
A step is closed only when all of these hold, with the evidence linked in the register row:
| Gate | Check | Tool |
|---|---|---|
| G-look | screenshots at 390x844 and 1440x900, motion Full and Off, both themes (CaesarOS and Neutral); Agrippa signs; contrast at least 4.5:1 for text over glass | Playwright matrix, `caesar-design`, `caesar-ui-review` |
| G-worst | worst-case data (long names, zero items, huge counts, RTL, missing fields) behind a Demo toggle breaks nothing | `caesar-break-ui` |
| G-motion | at most one ambient loop per surface; UI motion under 300 ms; only transform and opacity; Off means no animations and idle CPU near zero; no strobing | `caesar-review-animations`, `caesar-animation-performance`, `caesar-emil-design-eng` |
| G-touch | every target at least 44 px; no hover-only or keyboard-only action; works with one hand at 390 px | audit R3, `caesar-mobile-native`, `caesar-gestures` |
| G-perf | numbers recorded: idle CPU and RAM, FPS with WebGL and blur, long tasks, bundle size; compared with the budget in the step | perf probe from M0.4 |
| G-clean | console and network clean, `bun test` baseline not worse, build green, no new lint errors | CI |
| G-a11y | axe clean, focus order, `Escape` closes one thing, screen-reader names | axe, Lighthouse |
| G-safe | no outward action without a recorded yes; no secrets or private data in captures; client edition leak check | `tools/consumer-leak-check` |
| G-eyes | a second pair of eyes (a different crew member, Codex after its reset) reviews the diff; Konrad's yes per screen for look changes | Board rule |
| G-undo | Classic stays selectable; every change behind `settings.shell`; rollback is one switch | feature flag |
| G-skills | the step report lists which design skills ran and what they found | register R30 |
Soak and real-device tests: native app 8 h idle run; PWA on the iPhone 15 Pro Max by Konrad; native QA matrix N6.

## 10. How nothing slips (the recording)
1. **Register** `BUILD-REGISTER-2026-11-21.md`: requirement to step to test to status to evidence. `bun tools/plan-check.ts` fails on orphans; run it before every milestone report and in the nightly maintenance timers.
2. **Board:** Balbus creates one `[Album]` card per step (S0 to S8, N0 to N6) from the register, with the acceptance tests as checklist items and the gates of section 9. Operator-made cards are ignored by the dispatcher, so this goes through Balbus after the promo run.
3. **Brain:** one note `Projects/caesaros-build-plan` linking this plan, the register, the prototype and the promo; Konrad's decisions D0 to D5 as a decisions list. (Brain MCP was not available in the session that wrote this plan; the first session that can reach it writes the note and removes this line.)
4. **Repo handoff:** `docs/handoff/109-PRIMUS-PROTOTYPE-PROMO-BUILD-PLAN-2026-11-21.md` states where everything is; the session log gets one line per milestone.
5. **Memory:** the standing facts (decisions, palette, logo, platforms) are in the CAESAR project memory so a new session starts with them.
6. **Weekly rule:** if the register shows a requirement `open` with no step in `doing` for two working days, Caesar says so to Konrad as a notification; Konrad decides to schedule, drop or park it.
