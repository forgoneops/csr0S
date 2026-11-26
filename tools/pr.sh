#!/usr/bin/env bash
# The pull-request flow for CaesarOS. See CONTRIBUTING.md for the rules this script enforces.
#
#   tools/pr.sh start feat/my-thing          clean tree check, fetch, branch from trunk
#   tools/pr.sh ready "feat(x): summary"     run the gates, commit, print the request-pull
#   tools/pr.sh ready --push "…"             the same, then push the branch to the work remote
#   tools/pr.sh status                        branch, ahead/behind trunk, working tree
#
# Trunk is TRUNK if set, else main when it exists, else fix/repo-shape (the integration branch
# until main is created). Pushing is never implicit: only `ready --push` writes to a remote.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

TRUNK="${TRUNK:-}"
if [ -z "$TRUNK" ]; then
  if git show-ref --verify --quiet refs/remotes/origin/main || git show-ref --verify --quiet refs/heads/main; then TRUNK=main; else TRUNK=fix/repo-shape; fi
fi
WORK_REMOTE="${WORK_REMOTE:-work}"

say() { printf '%s\n' "$*"; }
die() { printf 'pr: %s\n' "$*" >&2; exit 1; }

gates() {
  local failed=0
  say "== bun test tests"
  bun test tests 2>&1 | tail -4 || failed=1
  say "== bunx tsc --noEmit -p ."
  bunx tsc --noEmit -p . && say "typecheck ok" || failed=1
  say "== bun tools/leak-check.ts"
  bun tools/leak-check.ts 2>&1 | tail -1 || failed=1
  say "== bun tools/plan-check.ts"
  if [ -f tools/plan-check.ts ]; then bun tools/plan-check.ts 2>&1 | tail -3 || failed=1; fi
  return $failed
}

case "${1:-}" in
  start)
    slug="${2:-}"
    [ -n "$slug" ] || die "usage: tools/pr.sh start <feat|fix|chore|docs|audit>/<slug>"
    case "$slug" in feat/*|fix/*|chore/*|docs/*|audit/*) ;; *) die "branch must start with feat/, fix/, chore/, docs/ or audit/" ;; esac
    [ -z "$(git status --porcelain)" ] || die "working tree is not clean; commit or stash first"
    git fetch origin --quiet || say "pr: fetch failed (offline?); branching from local $TRUNK"
    git rev-parse --verify --quiet "origin/$TRUNK" >/dev/null && base="origin/$TRUNK" || base="$TRUNK"
    git show-ref --verify --quiet "refs/heads/$slug" && die "branch $slug already exists"
    git checkout -b "$slug" "$base" && say "pr: on $slug from $base"
    ;;
  ready)
    push=0; [ "${2:-}" = "--push" ] && { push=1; shift; }
    title="${2:-}"
    [ -n "$title" ] || die 'usage: tools/pr.sh ready [--push] "<type>(scope): summary"'
    case "$title" in feat*|fix*|chore*|docs*|test*|refactor*|perf*) ;; *) die "title must start with feat|fix|chore|docs|test|refactor|perf" ;; esac
    [ "$(git rev-parse --abbrev-ref HEAD)" != "$TRUNK" ] || die "refusing to commit straight to trunk ($TRUNK)"
    say "Gates for: $title"
    gates || die "a gate failed; the branch is not ready"
    git add -A
    [ -n "$(git diff --cached --name-only)" ] || say "pr: nothing to commit (gates only)"
    if [ -n "$(git diff --cached --name-only)" ]; then git commit -m "$title" || die "commit failed"; fi
    branch="$(git rev-parse --abbrev-ref HEAD)"
    say ""
    say "== request-pull"
    git request-pull "$TRUNK" . "$branch" 2>/dev/null | head -20 || git log --oneline "$TRUNK..$branch"
    if [ "$push" = 1 ]; then
      git push "$WORK_REMOTE" "$branch" || die "push failed"
      say "pr: pushed $branch to $WORK_REMOTE; open the pull request against $TRUNK and paste the gate output"
    else
      say ""
      say "pr: not pushed. Review the request-pull above, then: tools/pr.sh ready --push \"$title\""
    fi
    ;;
  status)
    say "branch: $(git rev-parse --abbrev-ref HEAD)   trunk: $TRUNK"
    git rev-list --left-right --count "$TRUNK...HEAD" 2>/dev/null | awk '{print "behind trunk: "$1"   ahead: "$2}'
    say "working tree:"
    git status --short | head -20
    ;;
  *)
    sed -n '2,12p' "$0"
    ;;
esac
