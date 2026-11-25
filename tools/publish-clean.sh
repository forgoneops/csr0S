#!/usr/bin/env bash
# Publish the current tree to the clean private repo as one new commit on main.
# The commit author comes from CAESAROS_AUTHOR_NAME and CAESAROS_AUTHOR_EMAIL in the same file (outside the repo), else from git config.
# Needs ~/.config/caesaros/instances.env (outside the repo) with CAESAROS_CLEAN_REPO=<https url of the private repo>.
# The clean repo never sees the working history, only a leak-checked export of the tree. Large capture sets stay out.
# Usage: tools/publish-clean.sh ["message"]
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1090
[ -f "${CAESAROS_ENV:-$HOME/.config/caesaros/instances.env}" ] && . "${CAESAROS_ENV:-$HOME/.config/caesaros/instances.env}"
: "${CAESAROS_CLEAN_REPO:?set CAESAROS_CLEAN_REPO in ~/.config/caesaros/instances.env}"
CLEAN="${CAESAROS_CLEAN_DIR:-$HOME/apps/caesaros-app}"
[ -d "$CLEAN/.git" ] || git clone -q "$CAESAROS_CLEAN_REPO" "$CLEAN"
git -C "$CLEAN" pull -q --ff-only
SHA="$(git -C "$ROOT" rev-parse --short HEAD)"
EXP="$(mktemp -d)"; (cd "$ROOT" && git archive HEAD) | tar -x -C "$EXP"
while IFS= read -r x; do case "$x" in ""|"#"*) ;; *) rm -rf "$EXP/$x";; esac; done < "$ROOT/tools/clean-exclude.txt"
rsync -a --delete --exclude=.git --exclude=node_modules "$EXP/" "$CLEAN/"; rm -rf "$EXP"
cd "$CLEAN"; git add -A
if git diff --cached --quiet; then echo "nothing to publish"; exit 0; fi
bun tools/leak-check.ts
git ${CAESAROS_AUTHOR_NAME:+-c user.name="$CAESAROS_AUTHOR_NAME"} ${CAESAROS_AUTHOR_EMAIL:+-c user.email="$CAESAROS_AUTHOR_EMAIL"} commit -q -m "${1:-sync from the working line @$SHA}"
git push -q origin main && echo "published @$SHA"
