# S2 first run: detection and connectors

Author: Annona (Sysop), 2026-11-22. Owner of the S2 step together with Vitruvius.
Delivers requirement **R47** in `BUILD-REGISTER-2026-11-21.md`; source of truth for the
behaviour is `BRIDGE-DESKTOP-WEB-STANDALONE-2026-11-22.md` section 8. This note adds no
requirement: it says how first run detects and what "done" means for R47.

Source check: the request named three spec files (`docs/reference/specs/agentic-os/index.md`,
`03-detection.md`, `04-connectors-ai-runtimes.md`) on `origin/shell/m0.5-ship-plan`. On this
machine that branch does not exist in the CaesarOS repo and the paths do not exist in the
CAESAR repo (only `vps-bare/shell/m0.5-ship-plan` there, without them). The note is written
from R47 and bridge section 8, both in this repo; no text from the legacy study material was
copied in.

## 1. What first run must do

From R47 and bridge section 8:

1. First run **detects what the machine actually has** and offers only that.
2. Every engine and connector is **optional**; the app is usable with one model source and
   none of the rest.
3. **No default points at the owner's hosts, accounts or tools.** Owner defaults exist only
   in the owner layer, after it is installed.
4. The **Brain location is a setting**: local or remote. Local is the default for everyone
   but the owner; the owner's remote Brain is a value in the owner layer, never a constant.
5. A **clean machine** (no Claude Code, no Codex, no VPS) completes first run with one model
   source, nothing errors, and the Brain runs local.

## 2. Detection: PATH walk, not a shell

Detection never runs a shell and never reads a secret. It answers one question per tool:
*is this program on this machine, and does it say it is signed in?*

### 2.1 PATH walk

`walkPath(env)` splits `PATH` on the platform separator, drops empty and relative entries,
de-duplicates, and returns the directories in order. `findExecutable(name, dirs, probe)`
walks them in order and returns the first regular, executable file whose name matches
(`name`, or `name.exe` / `name.cmd` / `name.ps1` on Windows). It uses `statSync` and an
access check, not `Bun.which`, so the behaviour is identical on every platform and is
testable against a temporary directory tree.

Rules:
- An empty or missing `PATH` returns no directories; detection then reports "not found",
  never an error.
- A directory that cannot be read is skipped, not fatal.
- No globbing, no `~` expansion, no `PATH` entry from a config file: only the environment
  the process actually received.

### 2.2 The tools' own commands

A binary on `PATH` proves the tool is installed, not that it works. Each engine therefore
declares a **read-only probe command** that the tool itself ships, and detection runs it
with a short timeout, capturing stdout/stderr and the exit code:

| Engine | Probe | Signed in when |
|---|---|---|
| Hermes | `hermes --version` | exits 0 and prints a version |
| Claude Code | `claude --version` | exits 0 and prints a version |
| Codex | `codex --version` | exits 0 and prints a version |
| Ollama | `ollama --version` | exits 0 and prints a version |

Probe constraints, enforced in code and tested:
- **Allowlist only.** The probe string is a constant in the detector, never built from user
  input, and never passed through a shell: the command is split into argv and executed
  directly. There is no `sh -c`.
- **Short timeout** (default 2000 ms). A hung tool is reported as `timeout`, not as found.
- **Read-only.** No probe writes, installs, logs in or opens a browser. Version and list
  commands only.
- **No secrets.** The detector reads no credential file, no `.env`, no keychain. "Signed in"
  means the tool's own command answered; it never means a token was inspected.

Detection result per engine: `{ id, label, found, path, probe: { ran, ok, version, error } }`.
`found` is "the executable exists"; `ok` is "the tool answered". The UI offers an engine when
`found` is true and shows a "sign in" hint when `found` is true and `ok` is false.

### 2.3 Connectors

Connectors are not detected by scanning the machine. A connector is offered only when the
person says they have it, so the first-run list is built from the engine detection plus an
empty connector list; the person picks from a catalogue of vendors. Each entry carries:

- `id`, `label`, `vendor` (the product name),
- `signInCommand`: the vendor's own command or URL, **shown as text, never executed**,
- `kind`: `oauth` | `token` | `local`.

The rule "vendor command shown, not executed" is absolute: the app prints the command for
the person to run in their own terminal, because running it would be an outward-facing
action (a browser, an OAuth flow, a network write) and first run must not do that without
the person's word. The detector returns the command string; the UI renders it in a copyable
row. Nothing in the core ever calls it.

## 3. Offer only what exists

The first-run response is a list of offers, each with a reason:

- engine installed and answering → "ready, use it";
- engine installed but not answering → "installed, sign in: `<command>`";
- engine absent → not offered at all, and not mentioned as a failure;
- connector → offered only from the catalogue the person opens, never pre-selected.

The app must never show an empty "connect your Claude" prompt to someone who has no Claude.
Absence is silent. `offerable(detection)` returns exactly the engines with `found === true`,
and the count of model sources the person already has; if that count is zero the app says so
in one honest line and points at the local model option, not at an error.

## 4. Brain: local or remote, a setting

`settings.brain = { location: "local" | "remote", url: "" }`, default
`{ location: "local", url: "" }`.

- `local` means the Brain runs in this app's own data directory; no address is required.
- `remote` means the person supplies a URL; the value is validated as a URL and stored only
  when they save it. An empty URL with `remote` is a validation error, not a silent fallback.
- No default URL, host or account exists in the core. The owner's remote Brain is set in the
  owner layer, which writes the same setting.
- Changing the location does not migrate data and does not delete anything: the setting says
  where the app looks, and both paths are additive.

## 5. No owner defaults

Checked mechanically, not by review:

- A core import test already fails on any import from `owner/` or `plugins/` in the core
  graph; the detector module is in `core/` and imports only `node:` modules.
- The detection module contains no host name, no account name and no URL. A test asserts the
  serialised detection of an empty machine has no `url`, no `host` and no `token` field.
- `settings.gateways` stays `[]` and `settings.engine` stays `"local"` on a fresh install
  (already asserted in `tests/server.test.ts`).

## 6. Dry-run check mode

`bun core/detect.ts --check` prints the detection as JSON and exits 0 without writing
anything: no settings, no database, no log file. It is the same function the API calls, so
what the operator sees in the terminal is what first run would offer. Flags:

- `--check` (default when run from the CLI): print, write nothing.
- `--json`: machine-readable output for the nightly check and for tests.
- `--timeout <ms>`: probe timeout, default 2000.

Exit code is 0 when detection completed, even if nothing was found; a detection that could
not run at all (no PATH, unreadable environment) exits 2 with a reason. "Nothing found" is a
normal, successful answer on a clean machine.

## 7. What "done" means for R47

1. `bun core/detect.ts --check` on a machine with no Claude, Codex or Ollama prints the four
   engines as `found: false`, exits 0, and writes nothing.
2. On a machine with one tool installed, that tool is `found: true` and its probe result is
   reported; no other engine is offered.
3. `GET /api/detect` returns the same shape as the CLI, and the settings response carries
   `brain.location = "local"` with an empty URL on a fresh install.
4. A detection result contains no host, account, URL or token: asserted by test.
5. `bun test tests/detect.test.ts` and `bun run typecheck` pass.

## 8. Open questions

- **D5 sign-in off loopback** (bridge section 3, rule 6) is still open; the detector does not
  touch it. Until it is decided, a remote Brain over the network is the person's own choice
  and is not offered by default.
- Whether the connector catalogue ships with the core or as a pack. Recommendation: a pack,
  so the vendor list can be updated without a rebuild; the core only needs the shape.
- Whether `ollama list` should be the probe or a lighter `ollama --version`. Recommendation:
  `--version` for detection, `list` only when the person opens the local-model screen, so a
  stopped daemon is not reported as a failure on first run.

## 9. What this note does not do

It does not read the legacy study material in `docs/reference` and does not copy vendor or
AGPL text into this repo. It cites only documents that live in this repo. It does not deploy,
restart or change access; the work lands on branch `shell/s2-first-run`.
