# Changelog

All notable changes to CaesarOS. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
versions follow [Semantic Versioning](https://semver.org/). this file is the user-facing summary.

## [Unreleased]

### Changed

- **Hall of Fame**: the keepers are holograms, not an ASCII film and not a still image: each is a
  modelled ape general (plinth, greaves, pteruges, banded lorica, pauldrons, arms with a spear, standard
  or axe, shield or relic, cloak) in its own colour, with a fresnel rim, drifting scanlines and a lit
  ring at its feet. Hovering a keeper walks the camera in so the armour and the ape face read; the old
  static statue picture is gone from the background.
- **Hall of Fame backdrop**: drawn with ImageMagick by `tools/art/hof-temple.sh`: haze, a warm floor
  and a violet ceiling only, no figures and no columns, so nothing behind the projections looks like a
  statue.
- **Windows and workspaces**: a narrow window keeps its widgets (the phone layout carries the same
  stage in two columns), a window drag rebuilds the shell once instead of on every resize event, and
  the pop-out button stays available on a narrow desktop window.
- **Assets**: local scripts carry the build id and every asset answers `no-cache`, so an update is
  what actually runs instead of a cached copy.

### Added

- **Model choice per agent**: the chat's model menu offers what your signed-in accounts actually have —
  Nous Portal and the other providers Hermes reports, the ChatGPT models of the Codex subscription, and
  the local Ollama models — filed by provider. Picking one keeps it for that agent alone (one crew
  member, or one coding tool) and it survives a reload and a restart; a model the tool no longer offers
  is ignored, and a turn that names its own model still wins.
- `CONTRIBUTING.md` with the pull request rules, `.github/PULL_REQUEST_TEMPLATE.md`, `CHANGELOG.md`,
  and `tools/pr.sh` (`start`, `ready`, `status`) which runs the gates and prints the request-pull.

### Fixed

- The Hall of Fame froze on one frame (two arrays shared a name) and could crash on voice stop in
  WebKitGTK without the native `speechSynthesis` guard.
- The compiled core wrote its data to `/$bunfs` instead of the user's data directory, so a clean install
  could not start.
- `/favicon.ico` answered 404 on every launch; the page declares its icon.

## [0.1.0]: 2026-11-26

First public build of the local-first workspace.

### Added

- **Atrium shell**: eight workspaces of live widgets, tabs with pop-out, a terminal pane, split view and
  a command palette (`Ctrl K`); every surface scales from a narrow tiled window to a full desktop.
- **The crew**: Hermes profiles as named members with roles and status, a chat per member, approvals
  that wait for you, and a "What now" feed of what needs a decision.
- **Board**: plans as cards you can write, move and complete; **Library**: books, folders and reading.
- **Memory and Brain**: notes with folders, search and sync; findings surface on the home screen.
- **Local engines**: Ollama and the coding agents detected on the machine, with the local/cloud scope
  shown per engine; no chat leaves the machine unless you choose a cloud engine.
- **Speech**: local Piper text-to-speech with install guidance, and voice input through the core's
  transcription endpoint.
- **Hall of Fame**: ten keepers as holographic projections in a dark hall, each with a legend you can
  open (epithet, relic, line, link).
- **Native shell**: Tauri window that starts its own core, health-checks it and stops it on exit;
  Linux packaging with `tools/package-linux.sh` and a menu entry.

### Security

- Assets are served with `Cache-Control: no-cache` and a build id on local scripts, so an update is what
  you actually run.
- `data/` and `owner/` are never tracked; `tools/leak-check.ts` guards for secrets and absolute paths.

### Known gaps

- Readiness is 28/36 with 7 checks skipped (a real VPS pairing, the owner's data, computer control on
  this machine, and the release acts: licence, notices, install gate, a second agent).
- `render()` still replaces the whole main tree on an ordinary update, so non-entrance animations restart
  per chat turn.
- Some app pages are still placeholders ("APP PAGE") and Media Gallery shows only an empty state.
