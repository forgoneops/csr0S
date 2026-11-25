---
name: caesar-atrium-build
description: "Use when adding or changing anything in the CaesarOS Atrium (the approved prototype that is the app's face): a page, a widget, a chat target, a setup step, a control. Also: 'dodaj strone', 'podlacz do rdzenia', 'wire this page', 'Atrium', 'bridge.js'."
---

# Building in the Atrium

The Atrium is `web/atrium/`: the approved prototype, served by the core at `/`. It is plain HTML, CSS and JS, no build step. The old React shell (`web/src`) still answers its own routes and is the functional back-up, not the face.

## Rules
1. **The prototype's structure stays.** Same layout, same workspaces, same live widgets (move, resize, remove, add). Improve it, do not replace it. New assets only: our icons (Legio), our controls (`kit.css`).
2. **No invented data.** A page shows real data from the core or says plainly that it has none. Never ship demo numbers.
3. **Data goes through the bridge.** `web/atrium/bridge.js` fills the prototype's own globals (`CREW`, `THREADS`, `MSG`, `S.waiting`) from `/api/*` and calls the prototype's `render()`. Add new data the same way: fetch in a `load…()`, store, call `render()`. Never edit the prototype's render to know about the API.
4. **Overriding a prototype view:** assign into `OG['Page name']` (a function returning HTML) in a new file loaded after `bridge.js` (see `setup.js`). Register the file in `index.html` after `bridge.js`.
5. **Events** use one delegated listener on `document` in the capture phase with a `data-…` attribute (`data-su`, `data-ctx`). The prototype rebinds `onclick` on every render, so never bind directly.
6. **Never replay the entry animation inside a view.** `render()` is wrapped so `html[data-still]` is set when the view did not change; keep it. Pressing a button must not look like a reload.
7. **Icons** come only from `I('name', size)` which reads `icons/legio.svg`. Add an icon with the `caesar-legio-icons` skill.
8. **Controls** use the kit classes in `kit.css`: 44 px targets, the 45-degree cut (top right, bottom left), tint instead of fill, `:focus-visible` outline.

## Where things live
- Pages and chrome: `web/atrium/index.html`, `ns.js` (menu, start), `og.js` and `pages.js` (pages).
- Real data and behaviour: `bridge.js` (crew, chat, approvals, live bar, terminal), `setup.js` (first run).
- Styles: `real.css` / `ns.css` / `neo.css` are the prototype's; **put new rules in `kit.css`**.
- Core endpoints you will use: `/api/crew`, `/api/chat-targets`, `/api/chat/sessions`, `/api/approvals`, `/api/running`, `/api/terminal/*`, `/api/settings`, `/api/detect`, `/api/hardware`, `/api/models/pull`.

## Do
Run the core on your own port with a throwaway data folder, load `/?noboot`, and verify with the `caesar-atrium-verify` skill before saying it is done.
