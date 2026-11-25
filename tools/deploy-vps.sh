#!/usr/bin/env bash
# Put the current tree on the VPS as the second instance (caesaros-app.service, 127.0.0.1:4490), beside caesar.service.
# It never touches caesar.service. Data lives in ~/.local/share/caesaros-app on the VPS, outside the code folder.
# Needs ~/.config/caesaros/instances.env (outside the repo) with CAESAROS_VPS=<user@host>.
# Reach it from this PC:  ssh -L 4490:127.0.0.1:4490 <user@host>   then  http://127.0.0.1:4490
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1090
[ -f "${CAESAROS_ENV:-$HOME/.config/caesaros/instances.env}" ] && . "${CAESAROS_ENV:-$HOME/.config/caesaros/instances.env}"
DEST="${CAESAROS_VPS:?set CAESAROS_VPS in ~/.config/caesaros/instances.env}"
EXP="$(mktemp -d)"; (cd "$ROOT" && git archive HEAD) | tar -x -C "$EXP"
rsync -a --delete --exclude=.git -e "ssh -o BatchMode=yes" "$EXP/" "$DEST:caesaros-app/"; rm -rf "$EXP"
ssh -o BatchMode=yes "$DEST" 'export PATH=$HOME/.bun/bin:$PATH; cd ~/caesaros-app && bun install --frozen-lockfile >/dev/null && systemctl --user restart caesaros-app.service && sleep 3 && systemctl --user is-active caesaros-app.service && curl -s -m 5 127.0.0.1:4490/api/health'
echo
