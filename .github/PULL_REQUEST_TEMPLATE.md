## What this changes

<!-- one paragraph: the behaviour before, the behaviour after -->

## Why

<!-- the problem this solves; link the note, issue or session entry if there is one -->

## How it was verified

Paste the real output, not a summary. Delete the lines that do not apply.

```
$ bun test tests
# …

$ bunx tsc --noEmit -p .
# …

$ bun tools/leak-check.ts
# …

$ bun tools/plan-check.ts
# …
```

UI changes: screenshots at 1440x900 and 390x844 in `docs/design/captures/<slug>/`, and the browser
console showing zero page errors.

Native or packaging changes: the tarball sha256, the install result, and `curl -s /api/health`.

## Scope

- [ ] One concern only; unrelated cleanup is a separate pull request
- [ ] No secrets, no generated artefacts, no vendored code without a licence note
- [ ] `docs/STATE.md` has an entry with the numbers this change was measured with
- [ ] `CHANGELOG.md` updated if this is user-visible

## Risk and rollback

<!-- what can break, how it would be noticed, and how to undo it -->
