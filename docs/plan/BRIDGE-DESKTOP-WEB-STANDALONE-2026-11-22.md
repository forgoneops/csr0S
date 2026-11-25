# Bridge between the desktop app and the web app, and the web app standing alone

Author: claude-a (Primus), 2026-11-22. Source: Konrad, in the session: the most important thing is the bridge between the VPS (web app) and the desktop version, and the web app must also run **standalone** for people who do not want to install anything, for example on a VPS.

This note turns that into one rule set. It adds nothing to the plan except making the bridge a first-class requirement (R44). It sits on `POST-PROMO-BUILD-PLAN-NATIVE-AND-SYSTEM-2026-11-21.md` (one web code base, native shell, gateway registry) and does not change it.

## 1. Three ways to run the same product
| Mode | Who | What runs where | Install |
|---|---|---|---|
| **Standalone web** | person who will not install anything; Konrad's VPS | backend and UI both on one server; the browser or the PWA is only a window | none (open a link, optionally "add to home screen") |
| **Desktop, connected** | owner at the Lenovo | native shell shows the **same web UI**, pointed at a gateway (the VPS or this machine) | the native app |
| **Desktop with local gateway** | owner who wants local models, local files, this device's tools | a local gateway on the Lenovo, plus the VPS as a second gateway | the native app starts and stops it |

One web code base serves all three. The native app only adds what a browser cannot (tray, shortcuts, notifications, autostart, file picker, clipboard, device tools).

## 2. What the bridge is
The bridge is the **gateway registry** (plan step S5/N4): a list of places the UI can talk to, each with a name, address, key, health and what it can do.
- "VPS", "This device", later "Phone". The UI can be connected to more than one and shows which one answers (the engine chip).
- **Same sessions everywhere.** Chats, runs, approvals and settings live in the backend that owns them; every client (browser, PWA, desktop) sees the same ones. Desktop does not keep a second copy of the truth.
- **Device tools over the bridge.** The VPS can ask "This device" to do an allowlisted action (read a file, show a notification, run a listed tool), always audited, never a free shell, queued while the device sleeps (the Lenovo is a normal PC and may sleep).
- **Approvals follow the person.** An approval raised on the VPS can be answered from the desktop or the phone, and settles once.

## 3. Rules (acceptance tests live in the register as R44)
1. **Standalone works without the desktop app.** Opening the VPS link in a clean browser gives the full UI and every function that does not need this device's hardware.
2. **Desktop works without the VPS.** With only the local gateway it opens, chats with a local model and shows offline states honestly; it never blocks on a missing VPS.
3. **Both at once.** With both gateways, a chat started in the browser appears on the desktop within seconds and the reverse; an approval answered in one place disappears in the other.
4. **Loss of link is visible and safe.** If the bridge drops, the UI says which gateway is gone, keeps unsent text, queues device-tool calls and does not run them twice on reconnect.
5. **No hidden egress.** Data goes only to gateways the person added; the Privacy page lists them (pass 9 idea AE5).
6. **Sign-in off loopback (decision D5, open).** Until decided: tailnet only. The desktop must never bypass a client's access setting, and no PIN anywhere (standing rule).
7. **Editions.** Owner and client editions use the same bridge; the client edition has no PC-access tools.

## 4. Where it lands in the plan
| Step | Bridge content |
|---|---|
| N1 | window loads the VPS URL or a local server; connection picker (the registry) |
| N4 | start, stop and health of a local gateway; "This device" shows green on HTTP and WebSocket legs; device tools |
| S5 | Devices page, gateway registry, approvals routed to the owner's backend, phone sees the same sessions |
| S7 | PWA install and push so standalone web feels like an app |
| N6 | test matrix includes: VPS only, local only, both, link drop and return |

## 5. Open questions
- Should the desktop **always** start a local gateway, or only when the person turns on local models or device tools? (Recommendation: only on demand, so a plain desktop is a thin client and cannot go out of sync.)
- What is the minimum a standalone web visitor sees without the desktop (everything except device tools and local models)? Confirm.
- D5: how does a person who is not on the tailnet sign in to the standalone web app?

## 6. Core first, owner layer on top (Konrad, 2026-11-22, second message)
Konrad: today the desktop and the web app are connected through Hermes, but everything must also work on a **plain local setup**, with no gateway and none of his own setup (two clouds, the VPS, Jev and so on). The web app must run as a separate app on its own. The rebuild must not repeat the consumer-version cut, where most of it had to be patched out afterwards. Build a base skeleton first, then add his things on top so they can be unplugged.

Design rules that follow:
1. **The core is a complete app on its own.** Shell, chat, models and engines, settings, notes, memory, approvals, terminal pane, EN and PL, theme, PWA. It starts on a machine that has no VPS, no Jev, no crew, no Claude Code or Codex, no Brain server, and shows honest empty states instead of errors.
2. **The owner layer plugs in, it is never woven in.** Crew, Board, Brain, Lair, VPS gateway, Jev, the Claude bridge, PC-access tools, promo tooling and similar live behind one extension interface (the existing plugin mechanism and the tags owner-only / dev / pack). The core never imports from them; they register what they add (pages, rail entries, engines, tools, settings cards).
3. **Hermes is the link between desktop and web** when both are present, as it is today. Without Hermes the core still runs as a local app; with it, the bridge of section 2 appears.
4. **Build both from the same tree.** One build command makes the core alone, another makes core + owner layer. The core build is a CI gate: if anything in it needs the owner layer, the build fails.
5. **Remove test.** Deleting the owner-layer folder leaves the core building, passing its tests and starting. This is the guard against "we had to patch it out later".
6. **Per-client packs are layers too** (existing rule: profile packs of skills, no PC-access or dev plugins in the consumer build).

Consequence for the plan: S1 and S2 are built core-first; the owner pages (Board, crew, Brain, Lair) are registered from the owner layer, even though today they are in the same repo. N1 starts with a shell that works with zero gateways.

## 7. Everything is a swappable module (Konrad, 2026-11-22, third message)
Konrad: the app must be designed the way Caesar is designed: **everything can be unplugged and plugged in**, every module, and also the icon pack, the font pack and so on, so a pack can be changed without breaking the code. This modularity is what sets the product apart; hold to it. Visual polish is not the focus now; icons and the rest will be rebuilt later, which is exactly why they must be swappable.

Rules:
1. **Packs, not hard-coded assets.** Icons, fonts, art, palettes and themes are packs described by a manifest (name, version, license, entries). The UI asks for an icon by role name ("chat", "terminal"), never by file. A pack that lacks a role falls back to the default pack.
2. **Modules register themselves.** A page, rail entry, engine, tool or settings card is a module with a manifest and a register call. Removing the module removes its entries with no dangling reference.
3. **Swap test.** Changing the icon pack, the font pack or the palette is one setting; the build, the tests and the layout stay green with no code edit. A CI check fails if a component imports an icon or font file directly.
4. **Same mechanism for the owner layer** (section 6) and for per-client packs.
5. **Work is orchestrated, not hand-coded by Primus.** Primus orchestrates; crew and the two Claude workers build. Codex is down until its limit resets, so work goes to the crew and Claude workloads.

## 8. Standalone by choice, Brain local or remote, setup that does not assume the owner's stack (Konrad, 2026-11-22, fourth message)
- A person who wants only the web app needs no desktop. Desktop and web can be linked, or each can run alone.
- Konrad's own setup keeps the **Brain backend on the VPS**; for everyone else the Brain can run **fully local**. The Brain location is a setting (local, remote, or later both), not an assumption.
- **Connector setup happens at install, as a first-run step.** Having two Claude accounts and Codex is Konrad's situation, not the default. First run detects what is present (Claude Code, Codex, Hermes, local runtimes, API keys the person chooses to enter) and offers only those; every engine and connector is optional, and the app is fully usable with none of them beyond one model source.
- No default may point at the owner's hosts, accounts or tools. Owner defaults ship only in the owner layer (section 6).

Theme decision (Konrad, same message): NEO ROMA may exist as more than one theme. Because themes are packs (section 7), a second theme costs little; the first is NEO ROMA slimmed (no apes), the second stays neutral.
