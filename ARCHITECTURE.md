# Architecture (from register R44 to R48)

```
core/     complete app on its own: shell, chat, models and engines, settings, notes, memory,
          approvals, terminal pane, EN and PL. Imports nothing from owner/.
owner/    The owner's layer (kept outside the clean repo; in the working tree it lives here, in the clean export it is absent): crew, Board, Brain server, Lair, VPS gateway, Jev, Claude bridge,
          PC-access tools. Registers pages, rail entries, engines, tools and settings cards
          through the module interface. Deleting this folder must leave core building and running.
packs/    icons, fonts, themes, palettes, each with a manifest (name, version, license, entries).
          The UI asks for an icon by role name; a missing role falls back to the default pack.
docs/     specs and plans of the working tree. The clean (open-source) export leaves docs/ out entirely
          (`tools/clean-exclude.txt`); study material is kept only in the owner's tree.
```

Rules: core never imports owner; no component imports an icon or font file directly; one build makes core alone, another makes core + owner, and the core-alone build is a CI gate; bridge between desktop and web is the gateway registry (`docs/plan/BRIDGE-DESKTOP-WEB-STANDALONE-2026-11-22.md`); no deploy, release or main merge without Konrad's yes.

## The Lego rule
CaesarOS is built from blocks that snap together through written contracts, so any block can be rebuilt or replaced without touching the others.
- **Backend:** the core is a small spine (data folder, auth, event stream, module registry). Everything else is a module (chat, notes, Brain, tasks, computer, layer, engines) with its own routes and store. A module can be rewritten if its contract tests still pass.
- **Frontend:** the UI is a shell over the core's API only. The Atrium, the classic shell, a simple version or a new design can replace each other, and inside a shell each page is a module that registers itself.
- **Engines and agents:** Hermes, Claude Code, Codex, other CLIs and local models all enter through one adapter contract.
- **Core is open, with a warning.** The core spine can be changed by the owner or the user, but it is the dangerous layer: a change there can break every block. Changing it needs an explicit "Core unlocked" switch that shows a clear danger alert (what can break, how to undo) and keeps a visible banner while it is on. Blocks above the core stay safe to change without it.
- **Two instances:** the clean product is the blocks; the owner's instance adds private blocks from a separate layer. A block never reaches into another block's state or files.

