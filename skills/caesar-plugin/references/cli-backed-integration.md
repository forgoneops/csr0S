# CLI-backed plugin integrations

Use this workflow when a CAESAR plugin wraps an installed command-line tool for reading or changing state.

## 1. Establish the installed contract

- Resolve the profile/account from the setting CAESAR actually uses; run read-only commands against that exact target. Do not rely on the CLI's ambient default.
- Run `--help` for every operation the UI will expose. If help does not establish output or mutation semantics, inspect the installed CLI source; never infer them from a test fixture.
- Capture a representative read-only output. For Hermes cron, check both `hermes -p <profile> cron list --all` and `hermes -p <profile> cron create --help`. The current CLI list uses a Unicode-framed banner for populated results, a separate plain-language empty result, optional warning/overdue rows, and an execution summary; `NO_COLOR` does not remove the frame. The current create CLI supports `--paused` and `--paused-reason`.

## 2. Make parser tests reflect reality

- Turn observed output into a sanitized fixture: replace IDs and names, but preserve framing, whitespace, ANSI behavior, line endings, optional fields, and warning text shape.
- Write a regression test for the observed format first and run it red before changing the parser. Also cover the empty result and at least one optional/warning case.
- Keep empty-state recognition narrow. A CLI error, unknown banner, malformed row, or truncated output must remain an error rather than appearing as an empty collection.
- Preserve meaningful optional data such as warnings, overdue status, and execution summaries instead of silently discarding it. Keep configuration state (for example enabled/paused) separate from a current execution state; animate or label a run only when the CLI explicitly reports that execution is running.

## 3. Mutate atomically and verify

- Pass a string argv array to the process API, never a shell command string. Validate IDs and inputs, but keep multiline prompt text as one argv value when the CLI accepts it.
- Prefer the CLI's native safe/atomic options. For Hermes cron, create with `--paused --paused-reason <reason>` in the same command; do not create an active job and pause it afterward, because a scheduler tick can fire in the gap.
- In tests, exercise an argument builder or a fake executable; never create, edit, run, pause, or remove a real scheduled job as a test.
- After a user-triggered mutation, re-read the exact affected ID and assert the requested postcondition before reporting success. Prefer an ID returned by the CLI over inferring the new record from a before/after list, because another client can create a record concurrently.
- If the post-mutation read fails, report the mutation outcome as uncertain and include the safest recovery action; do not claim the change was confirmed.
