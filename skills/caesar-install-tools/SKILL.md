---
name: caesar-install-tools
description: "Use when a tool (Hermes, Claude Code, Codex, Gemini CLI) is missing and the operator wants it installed, asks what the Install button does, or when adding a new installable tool to CAESAR's first-run setup. Triggers: zainstaluj, install, brak narzedzia, Install button, first run, pierwsze uruchomienie, nie wykryto, tools not found."
---

# Installing missing tools (plugin `tools`, Setup step "Your tools", Tools page)

Detection finds what is on the machine (`GET /api/p/tools/detect`: presence and a login file's existence, never its contents). **Detection is not consent, and a click is not blind trust:** the Install flow shows exactly what runs and runs only that.

## The flow
1. `GET /api/p/tools/installers` lists only the missing tools with how they install and whether the prerequisites exist (bash, npm).
2. `POST /install/preview {id}`: for a script tool (Hermes, Claude Code) CAESAR downloads the official installer into its own data folder and returns its **address, size, sha256** and its first 600 characters; for an argv tool (Codex, Gemini CLI: `npm install -g …`) it returns the fixed command. Nothing runs.
3. The operator confirms. `POST /install/run {id, sha256}` runs **only the file whose hash was shown** (`bash <file>`, no `curl | bash`) or the fixed argv, 5 minutes at most, then re-detects and writes a ledger row (`verified` only if the tool is detected afterwards, else `failed`).

## Rules (hard)
1. **Operator only**; an agent never installs a tool, and never calls these routes for the operator.
2. Never skip the preview, and never run a different file than the one hashed. A hash mismatch means preview again.
3. Installs that need `sudo` or system packages (Ollama, tmux, bubblewrap, ffmpeg) are **not** done here: show the operator the command for their package manager and let them run it in the Terminal.
4. Signing in is the operator's step (`claude`, `codex login`, Hermes page). Say so after an install; do not try to log in.
5. Adding a tool: one entry in `plugins/tools/installers.ts` from the tool's own official instructions (https only, or a fixed argv that starts with the program it needs), plus its probe in `server.ts`. `tests/tool-installers.test.ts` checks every entry.

## Not done yet
A local model adapter (Ollama and LM Studio detection exists; installing and wiring a model does not), the platform layer for macOS and Windows installers, and one "Connect all" run over everything already signed in.
