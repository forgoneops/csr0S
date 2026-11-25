---
name: caesar-plugin
description: Create a new CAESAR plugin (a page, an API, a connector) from scratch. Use when the operator asks for a new feature, tab, integration or tool inside CAESAR.
---

# Making a CAESAR plugin

## Client-specific, removable plugins

When a feature must be removable, trace ownership across both server and browser before coding: manifest/server, UI routes, shell mounts, central API wrappers, and every direct sibling-plugin import or API/event dependency. Read `core/plugins.ts`, the generic frontend loader, `web/src/App.tsx`, and a current plugin client before choosing the boundary; a manifest alone does not make a feature detachable. Keep feature-specific pages, styles, logic, tests and docs in `plugins/<id>/`; core changes must be generic contracts or extension points. Check both directions of every dependency: a feature can be pinned by an importer, a hard-coded route, or a shell consumer even when its own files are in a plugin folder. Preserve plugin data when removing code. Backend discovery happens at server startup and frontend client modules are bundled at build time, so a clean code detach normally requires a frontend rebuild and backend restart; do not describe it as hot-pluggable unless that behavior is implemented and tested.

Before coding, state where uploaded assets live, whether they leave the browser or CAESAR host, which AI/provider receives them, and whether outputs are stored or published. Prefer browser-memory processing and local rendering when that satisfies the task; do not send client media to an AI/image service or publish to a social platform without explicit approval. For offer artwork, preserve source photos, allow crop/layout only, use operator-supplied facts verbatim, and never infer listing claims. Make export separate from publish. Do not claim folder-only removal while `App.tsx`, a shell integration, or another feature still references the module; do not delete client data automatically with code removal.

1. `plugins/<id>/plugin.json`:
```json
{ "id": "<id>", "name": "<Name>", "version": "0.1.0", "description": "<one plain sentence>",
  "nav": [{ "id": "<id>", "label": "<Plain name>", "name": "<Name in CAESAR's world>", "icon": "<icon>", "path": "/<id>", "category": "talk|day|work|knowledge|make|system", "tip": "<tooltip>" }],
  "routes": ["/<id>/sub"],          // optional: more path prefixes the page answers
  "settings": [{ "id": "<section>", "title": "<Title>", "label": "<short note>" }],   // optional: a section in Settings
  "shell": false,                   // optional: true when client.tsx exports a component the app mounts once
  "permissions": ["<what it touches: shell:x, fs:y, net:z>"] }
```
2. `plugins/<id>/server.ts`:
```ts
import type { PluginContext } from "../../core/plugins";
export default function (ctx: PluginContext) {
  ctx.routes.get("/items", (c) => c.json(ctx.store.get("items", [])));   // GET /api/p/<id>/items
}
```
`ctx.store` is a namespaced key-value store; `ctx.dataDir` is for files; `ctx.publish(type, data)` sends live events.

### External CLI-backed plugins
Before designing a parser or mutation flow, inspect the exact read-only CLI output and `--help` for the profile selected by CAESAR; do not treat a hand-written fixture or remembered flags as the contract. Use argv arrays, native atomic safety flags, and read back the affected record before reporting success. Follow `references/cli-backed-integration.md` for fixture, state, and side-effect rules.

Every page gets a name in the troop's world (Roman camp language: Campaigns, Watchtower, Armory)
in `name`, and what it is in plain words in `label`. The page title is `<Title path="/<id>"
fallback="<Plain name>" />` from `web/src/ui/Title.tsx`, so it follows the same names and the
plain-names switch.
3. Types shared with the UI go into `core/schema.ts`. When a page consumes another plugin's API, inspect its pagination, caps and time-window semantics before presenting the result as complete; surface any known limit in the UI.
4. Single-page UI: put the default-exported page in `plugins/<id>/client.tsx` and its stylesheet in `plugins/<id>/client.css`; let the generic plugin loader render it. Do not add a plugin-specific import or route branch to `web/src/App.tsx`. Inspect the loader's actual ownership and path-matching rules first: do not assume a nav item's `id` equals the owning plugin id or that exact-path matching covers nested/dynamic routes. For multiple nav entries or deep links, extend the shared manifest/route contract and test it before moving pages; do not work around it by placing feature UI in `web/src/pages/`. Use ui-kit classes (`panel`, `section-head`, `btn`, `chip`, `toggles`), `<Icon>`, `<Tip>` for tooltips, and `reveal` for entrance.
   The page contract (`web/src/plugin-client.tsx`, rules in `web/src/plugin-routes.ts`): `plugins/<id>/client.tsx` default-exports a component `{ go, path }` for every nav path and every `routes` prefix of the plugin (it reads `path` to tell `/lair` from `/lair/varro`). It may also export `settings = { <section id>: Component }` (one per manifest `settings` entry) and `shell` (a component mounted once after boot, manifest `"shell": true`). Import shared UI from `../../web/src/ui/...`, never from another plugin. Shared styles stay in `web/src`; a plugin's own styles are `client.css`. Cards for the Colony: manifest `cards: [{ id, title, order }]` and `export const cards = { <id>: Component }` in client.tsx. Background work uses `ctx.interval(fn, ms)` (never `setInterval`) and `ctx.listen`, so switching the plugin off in Settings really stops it (`core/plugin-life.ts`); `ctx.onStop(fn)` runs on switch-off. A plugin switched off at start is not initialised at all, so keep startup probes inside `default(ctx)`, never at import time. Removing `plugins/<id>/` removes its pages, its Settings sections and its shell component, and the app still builds (tested by copying the repo without the plugin).
5. Icons: reuse `themes/hexameter/icons/*.svg`, or add one following `docs/DESIGN-WORKFLOW.md` §6.
6. Verify in layers: run focused tests, typecheck, production build, and `git diff --check`; test route ownership for single, multi-entry, and nested paths as applicable. Search both directions for remaining App imports/routes, shell mounts, central API wrappers, and sibling-plugin imports. Before claiming removable, rehearse detachment in a disposable worktree: remove only the plugin code there, rebuild, and verify the shell plus dependent plugins still work and the plugin nav/routes disappear while its data remains untouched. A successful build is not proof of live activation; the server reads manifests at startup, so verify `/api/plugins` and navigation only after an authorized restart. For backend/chat-path changes, inspect `/api/p/agents/runs` before restarting and preserve independent active turns; distinguish the current conversation from other runs when identifiable. If an explicitly requested restart would interrupt only the current turn, explain that risk once and use the safest authorized path rather than blocking repeatedly. Keep live UI verification separate from source/build checks.

## Theme independence
Every page and tool must work if someone drops the ape theme. Style with theme tokens only (`--accent`, `--surface`, `--text`, `--muted`, `--line`, `--danger`, `--tint-*`), never a raw colour. Give each menu entry a plain `label` and an optional in-world `name`; use plain words in buttons and errors. Art, scenes and motion are optional with a text fallback. Plugin `client.css` files are discovered by the theme-independence test; do not maintain a per-plugin stylesheet list. Details: `docs/design/THEME-INDEPENDENCE.md`.

## Every tab has a header with its own living picture
A new tab gets a header image in the spirit of The Lair (an inked picture with a few quiet, minimal animated layers), and its motion is different from the other tabs: not the same ember flicker everywhere. Keep it small and calm. Each animation has its own on/off switch and stops under `prefers-reduced-motion`. It must not depend on the ape skin (theme independence): the picture and motion come from the theme, with a plain header as the fallback when a theme has none.
