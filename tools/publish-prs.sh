#!/usr/bin/env bash
# Open one pull request per target GitHub repo with a leak-checked export of the current tree. Never touches the owner's VPS.
# Targets (both private until the premiere): csrOS (the owner's private copy) and csr0S (the premiere mirror).
# The export is the same clean tree publish-clean.sh makes (tools/clean-exclude.txt left out). Per target, KEEP lists paths that
# stay as they are in that repo (csr0S keeps its own README and docs). Nothing merges here: `--merge` merges the open PR.
# Usage: tools/publish-prs.sh ["pr title"]        open or update the PRs
#        tools/publish-prs.sh --merge             merge the open sync PRs (squash) once the gates were green
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[ -f "${CAESAROS_ENV:-$HOME/.config/caesaros/instances.env}" ] && . "${CAESAROS_ENV:-$HOME/.config/caesaros/instances.env}"
OWNER="${CAESAROS_GH_OWNER:?set CAESAROS_GH_OWNER (the GitHub account) in ~/.config/caesaros/instances.env}"
TARGETS=("csrOS:" "csr0S:README.md docs")        # name:space-separated paths kept as they are in that repo
NAME="${CAESAROS_AUTHOR_NAME:-}"; MAIL="${CAESAROS_AUTHOR_EMAIL:-}"
author() { git ${NAME:+-c user.name="$NAME"} ${MAIL:+-c user.email="$MAIL"} "$@"; }

if [ "${1:-}" = "--merge" ]; then
  for t in "${TARGETS[@]}"; do r="${t%%:*}"
    n="$(gh pr list -R "$OWNER/$r" --state open --search 'sync from the working line in:title' --json number -q '.[0].number' || true)"
    [ -n "$n" ] && gh pr merge "$n" -R "$OWNER/$r" --squash --delete-branch && echo "merged $r#$n" || echo "$r: no open sync PR"
  done; exit 0
fi

SHA="$(git -C "$ROOT" rev-parse --short HEAD)"; TITLE="${1:-sync from the working line @$SHA}"
case "$TITLE" in "sync from the working line"*) ;; *) TITLE="sync from the working line: $TITLE" ;; esac
EXP="$(mktemp -d)"; (cd "$ROOT" && git archive HEAD) | tar -x -C "$EXP"
while IFS= read -r x; do case "$x" in ""|"#"*) ;; *) rm -rf "$EXP/$x";; esac; done < "$ROOT/tools/clean-exclude.txt"
for t in "${TARGETS[@]}"; do
  r="${t%%:*}"; keep="${t#*:}"; DIR="$HOME/apps/$r"
  [ -d "$DIR/.git" ] || git clone -q "https://github.com/$OWNER/$r.git" "$DIR"
  cd "$DIR"; git fetch -q origin; git checkout -q main; git reset -q --hard origin/main   # the clone is only a staging copy; local edits go to a patch first
  BR="sync/$(date +%Y%m%d)-$SHA"; git checkout -q -B "$BR"
  EX=(--exclude=.git --exclude=node_modules); for k in $keep; do EX+=(--exclude="/$k"); done
  rsync -a --delete "${EX[@]}" "$EXP/" "$DIR/"
  git add -A
  if git diff --cached --quiet; then echo "$r: nothing to publish"; git checkout -q main; continue; fi
  bun tools/leak-check.ts
  author commit -q -m "$TITLE"
  git push -q -f origin "$BR"
  PR="$(gh pr list -R "$OWNER/$r" --head "$BR" --json number -q '.[0].number' || true)"
  if [ -z "$PR" ]; then gh pr create -R "$OWNER/$r" --base main --head "$BR" --title "$TITLE" --body "Clean export of the working line at $SHA. Gates ran in the working repo (tests, typecheck, leak-check). Nothing private in it." ; fi
  git checkout -q main
done
rm -rf "$EXP"
