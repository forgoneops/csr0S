---
name: caesar-ui-sdk
description: "Use when building or rebuilding any CAESAR interface control: select, menu, popover, dialog, tabs, listbox, combobox, tree, drag and drop, command palette. Uses the ui-sdk behaviours (@ui-sdk/core + @ui-sdk/react, Vercel Labs, Apache-2.0) for keyboard, focus, selection, dismissal and ARIA, dressed in the CAESAR look."
---

# UI SDK in CAESAR

Installed in the repo: `@ui-sdk/core` and `@ui-sdk/react` (0.1.0-beta.1, React 19). Headless: it brings behaviour and ARIA, no styles. The look is always CAESAR (theme tokens, own icons, clipped corners, mono labels), never `web.css`.

## Read first
Docs ship with the installed version, as Markdown: `node_modules/@ui-sdk/react/docs/llms.txt` is the index; then only the page you need (`docs/components/select.md`). The upstream guide is `node_modules/@ui-sdk/core/skills/ui-sdk/SKILL.md` with `references/` (build-interface, create-component, agent-ready, testing). Do not read `dist/*.js`.

## CAESAR rules on top
- Import from entries: `@ui-sdk/react/select`. No root import, never `@ui-sdk/core/internal/*`.
- Replaces hand-rolled controls (rule "no stock controls": no native select/details). Before writing any `role=` on a div, check whether ui-sdk ships it. The CAESAR `Select` (`web/src/ui/Select.tsx`) can be rebuilt on `@ui-sdk/react/select` when it is next touched.
- Style from state attributes (`data-slot`, `data-open`, `data-pressed`) in the CAESAR CSS, with theme tokens; no `web.css`. Put `@layer ui-sdk;` at the top of the global stylesheet when the first component lands.
- Desktop and mobile parity: every action reachable by tap and keyboard; no hover-only. ui-sdk gives keyboard and focus, you add the touch target (44px) and a button for anything gesture-only.
- Name every control (label part or `aria-label`). English UI names; technical terms stay English.
- Do not use it for the WebGL views (Brain Tree, Nebula, River, Orbits): they have their own engine (`plugins/brain/glow.ts`). Use it for the chrome around them (view switch, folder filter, menus).
- Agent-ready: ui-sdk can expose controls to agents (`createAgent`, WebMCP). Treat that as a later step for the consumer build; owner build only, and only after the owner approves what an agent may click.

## Done means
Typecheck (`bunx tsc --noEmit -p .`), a keyboard and focus test for the control, a look at it on a 390px viewport, then commit the explicit paths.
