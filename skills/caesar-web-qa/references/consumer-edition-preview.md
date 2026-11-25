# Local consumer-edition preview

Use this procedure when the operator asks to run CAESAR's consumer edition locally for testing. This is not a release, upload, client-server install, or public/tailnet exposure.

## Procedure

1. **Fix the source revision.** Read the latest consumer release brief/runbook and inspect `git status --short -- edition/consumer.json edition/changelog-pl.json tools/consumer-export.ts`. `tools/consumer-export.ts` archives code from `HEAD` but reads `edition/consumer.json` from the working tree; stop if that manifest is dirty or resolve the intended manifest before exporting. Tell the operator that uncommitted code is excluded.
2. **Use a new scratch tree and data directory.** Create a unique directory under `$TMPDIR` and separate `tree`, `home`, `data`, and `tmp` children. Never point the preview at the nightly `data/` directory or an existing client data directory.
   ```bash
   PREVIEW_DIR="$(mktemp -d "$TMPDIR/caesar-consumer-preview.XXXXXX")"
   mkdir -p "$PREVIEW_DIR/tree" "$PREVIEW_DIR/home" "$PREVIEW_DIR/data" "$PREVIEW_DIR/tmp"
   ```
3. **Export and check the package.** Run `bun tools/consumer-export.ts "$PREVIEW_DIR/tree"`. Inspect the exported manifest and count its plugin manifests; verify excluded owner-only plugins and private material are absent. The export helper reads committed files, but it does not make a dirty working-tree manifest safe by itself.
4. **Install only inside the export and build the consumer edition.**
   ```bash
   cd "$PREVIEW_DIR/tree"
   bun install --frozen-lockfile
   CAESAR_EDITION=consumer bun run build
   ```
   This is a local dependency install in the isolated export, not a system-wide install. Run one build at a time on a memory-limited machine.
5. **Choose a free loopback port.** Check the candidate port with `ss -ltnp "sport = :$PORT"`. If occupied, select another free port; do not kill an existing preview or the nightly on 4400.
6. **Run with an empty environment and isolated state.** Keep only the required `HOME`, `PATH`, `TMPDIR`, `CAESAR_EDITION=consumer`, `CAESAR_HOST=127.0.0.1`, `CAESAR_PORT`, and `CAESAR_DATA` variables, then run `bun core/server.ts` from the exported tree. Keep the process running only when the operator asked for a usable preview; bind to `127.0.0.1` and do not start Tailscale Serve.
7. **Verify the service and package.** Check `/api/health`, `/api/version`, and `/api/plugins/all`; verify the listener is on `127.0.0.1`, the expected plugin count is running, and excluded plugins are absent. Report the consumer changelog version separately from the core API version because those values may differ.
8. **Smoke-test without changing first-run state.** Open `http://127.0.0.1:$PORT/`; confirm Polish language, the app root mounted, and `document.documentElement.scrollWidth <= innerWidth` at 320×720, 390×844, and 1440×900. On fresh data, leave the welcome/setup wizard open: do not click through, enter provider credentials, send chat messages, or persist settings unless the operator explicitly requests those tests.
9. **Report exactly what is running.** Give the loopback URL, source commit, changelog/core versions, plugin count, isolated data path, build/health result, and which first-run or provider-auth steps remain untested. Keep the scratch data until the operator confirms testing is finished; do not clean it up as part of launch.

## Pitfalls

- Inspect `tools/preview-clients.sh` before running it: a helper that stops a fixed PID or removes a fixed cache tree can interrupt or delete an earlier preview. Prefer a new scratch tree when the helper's cleanup scope is not safe.
- Do not use `tools/release-clients.sh` for a local preview; release scripts may sign, upload, or contact the release server.
- A successful build is not proof the app is running. Verify the local health endpoint, loopback listener, plugin inventory, and rendered first-run screen separately.
