#!/usr/bin/env bash
# The repo warden's one door: check or merge the open sync PRs on the two GitHub repos, only when every law holds.
# Laws (also in the warden agent's brief): the PR comes from a sync/* branch made by tools/publish-prs.sh; its body names a
# commit of the working line; that commit is an ancestor of trunk; at that commit typecheck, the full test suite, leak-check
# and data-guard pass; the PR files equal a fresh clean export of that commit (nothing extra, nothing private). Then squash-merge.
# Never: tag, release, force-push, change visibility, touch the VPS. Any doubt = no merge, report why.
# Usage: tools/warden.sh check | tools/warden.sh merge
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"; MODE="${1:-check}"
[ -f "${CAESAROS_ENV:-$HOME/.config/caesaros/instances.env}" ] && . "${CAESAROS_ENV:-$HOME/.config/caesaros/instances.env}"
OWNER="${CAESAROS_GH_OWNER:?set CAESAROS_GH_OWNER}"; TRUNK="${CAESAROS_TRUNK:-fix/repo-shape}"
KEEP_csrOS=""; KEEP_csr0S="docs"
fail=0; say() { echo "warden: $*"; }
for r in csrOS csr0S; do
  n="$(gh pr list -R "$OWNER/$r" --state open --search 'sync from the working line in:title' --json number -q '.[0].number')"
  [ -z "$n" ] && { say "$r: no open sync PR"; continue; }
  head="$(gh pr view "$n" -R "$OWNER/$r" --json headRefName,body -q '.headRefName')"
  sha="$(gh pr view "$n" -R "$OWNER/$r" --json body -q .body | grep -o 'working line at [0-9a-f]\{7,40\}' | awk '{print $4}')"
  case "$head" in sync/*) ;; *) say "$r#$n: branch $head is not sync/*, refused"; fail=1; continue;; esac
  [ -n "$sha" ] && git -C "$ROOT" merge-base --is-ancestor "$sha" "$TRUNK" || { say "$r#$n: commit '$sha' is not on $TRUNK, refused"; fail=1; continue; }
  W="$(mktemp -d)"; git -C "$ROOT" worktree add -q --detach "$W" "$sha"
  ( cd "$W" && ln -s "$ROOT/node_modules" node_modules 2>/dev/null; bunx tsc --noEmit && bun test tests && bun tools/leak-check.ts && bun tools/data-guard.ts ) >"$W/gate.log" 2>&1
  gate=$?; [ $gate -ne 0 ] && { say "$r#$n: gates FAILED at $sha (log: $W/gate.log), refused"; fail=1; continue; }
  # the PR must equal a clean export of that commit: same file list, no extras
  EXP="$(mktemp -d)"; (cd "$W" && git archive HEAD) | tar -x -C "$EXP"
  while IFS= read -r x; do case "$x" in ""|"#"*) ;; *) rm -rf "$EXP/$x";; esac; done < "$W/tools/clean-exclude.txt"
  keep="KEEP_$r"; for k in ${!keep}; do rm -rf "$EXP/$k"; done
  extra="$(gh pr diff "$n" -R "$OWNER/$r" --name-only | while read -r f; do case "$f" in docs/*) [ "$r" = csr0S ] && continue;; esac; [ -e "$EXP/$f" ] || [ ! -e "$W/$f" ] || echo "$f"; done)"
  [ -n "$extra" ] && { say "$r#$n: files in the PR that a clean export would not hold:"; echo "$extra" | head; fail=1; continue; }
  say "$r#$n: all laws hold at $sha"
  if [ "$MODE" = merge ]; then gh pr merge "$n" -R "$OWNER/$r" --squash --delete-branch && say "$r#$n merged"; fi
  git -C "$ROOT" worktree remove --force "$W"; rm -rf "$EXP"
done
exit $fail
