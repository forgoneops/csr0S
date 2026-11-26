# Contributing to CaesarOS

CaesarOS is built by a small crew of agents and people. These rules exist so that a change can be
trusted without re-reading the whole diff: every claim in a pull request must be backed by a command
that ran, not by a description of what should have happened.

## Trunk and branches

- **Trunk is `main`.** Until `main` exists on the remote, integrate on `fix/repo-shape`; the rules below
  apply to whichever branch is declared trunk in this file.
- Never commit directly to trunk. Every change arrives as a pull request from a topic branch.
- Branch names, lowercase, slash separated:
  - `feat/<slug>`: new behaviour
  - `fix/<slug>`: a defect fixed
  - `chore/<slug>`: build, tooling, dependencies, repo shape
  - `docs/<slug>`: documentation only
  - `audit/<slug>`: findings and evidence without behaviour change
- One concern per branch. If a branch needs two unrelated fixes, it is two pull requests.
- Keep a pull request reviewable: aim for under ~400 changed lines; a larger change needs a plan note
  in the issue first and is reviewed in slices.

## Commits

Format: `<type>(<scope>): <summary>` in the imperative mood, summary under 72 characters.

```
feat(hof): the hall is drawn in ASCII
fix(atrium): a narrow window keeps its workspace widgets
chore(git): ignore the shared node_modules symlink
```

- `<type>` is one of `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `perf`.
- `<scope>` is the area: `atrium`, `core`, `tauri`, `board`, `library`, `hof`, `speech`, `git`…
- The body explains **why**, in prose, and names the verified facts (counts, paths, hashes).
- Never a commit message that claims a result which was not produced by a command in that session.

## Gates: the pull request is not ready until these pass

Run from the repository root, and paste the real output into the pull request:

```sh
bun test tests                     # all tests, no skips added by the author
bunx tsc --noEmit -p .             # types
bun tools/leak-check.ts            # no secrets, no absolute home paths
bun tools/plan-check.ts            # the plan and the tree agree
```

Additional gates, by the kind of change:

| Change | Also required |
|---|---|
| Any UI surface | screenshots at 1440×900 and 390×844, attached to the pull request, plus the console log showing no page errors |
| Native shell / packaging | `tools/package-linux.sh` exits 0, the installed build starts, `curl /api/health` answers, sha256 of the tarball recorded |
| Motion | the motion switch in all three states, and `prefers-reduced-motion` respected |
| Data or storage | a fresh-profile run (`CAESAROS_DATA` on an empty dir) and one upgrade run on existing data |

A gate that was skipped is reported as skipped. A skipped gate counts as not passed.

## Review and merge

- Every pull request needs **one reviewer who did not write it**. For agent work that reviewer is Caesar;
  for Caesar's own work it is a second agent (Codex or Claude Code) or the owner.
- The reviewer checks the gates by re-running them, not by trusting the description, and reads the diff
  for scope creep.
- **The owner merges, or explicitly authorizes the merge.** An agent may prepare a merge; it never performs
  one on its own.
- No force-push to trunk. No rewriting history on a branch that has been reviewed.
- If a review requests changes, the author pushes new commits on top; no rebasing mid-review.

## What never goes in

- Secrets, tokens, private keys, `.env` files, or machine names and accounts. `data/` and `owner/` are
  git-ignored for this reason; keep them ignored.
- Generated artefacts: `dist/`, `node_modules/`, build logs, screenshots.
- Vendored code without a licence note.
- A change that weakens a gate (removing a test, loosening a type, skipping a check) unless the pull
  request argues it explicitly and the reviewer agrees.

## Records

- `CHANGELOG.md`: one entry per released version, written for a user, not for a developer.

## Tooling

`tools/pr.sh` runs this flow:

```sh
tools/pr.sh start feat/my-thing        # clean tree check, fetch, branch from trunk
tools/pr.sh ready "feat: my thing"     # run the gates, commit, show the request-pull
tools/pr.sh ready --push "feat: my thing"   # same, then push the branch to the work remote
tools/pr.sh status                     # branch, ahead/behind trunk, gate results
```

Pushing and opening a pull request are acts on other machines: the agent runs them only when the owner
has approved that specific push.
