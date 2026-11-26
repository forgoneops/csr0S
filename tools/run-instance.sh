#!/usr/bin/env bash
# Run one of the two instances of CaesarOS from this one code base.
#   tools/run-instance.sh clean    the product: no personal data, standard edition, no owner layer, port 4480
#   tools/run-instance.sh mine     yours: your data folder and your private owner layer, port 4479
# The code is the same; only the data and the owner layer differ, and neither lives in this repo, so a patch made here
# reaches both and cannot carry your data anywhere. Override with CAESAROS_PORT, CAESAROS_DATA, CAESAROS_OWNER_DIR.
# Instances bind 0.0.0.0 by default so the same workspace is reachable from any device (tailnet/phone/VPS); the
# local-only desktop path (tools/run-desktop.sh) stays on 127.0.0.1. Override with CAESAROS_HOST.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WHICH="${1:-}"
export CAESAROS_HOST="${CAESAROS_HOST:-0.0.0.0}"
case "$WHICH" in
  clean)
    export CAESAROS_PORT="${CAESAROS_PORT:-4480}"
    export CAESAROS_DATA="${CAESAROS_DATA:-$HOME/.local/share/caesaros-clean}"
    export CAESAROS_EDITION="${CAESAROS_EDITION:-standard}"
    export CAESAROS_MODULE_DIRS="plugins"
    export CAESAROS_SKILLS_DIR="${CAESAROS_SKILLS_DIR:-$ROOT/skills}" ;;     # never the owner's own skills folder
  mine)
    export CAESAROS_PORT="${CAESAROS_PORT:-4479}"
    export CAESAROS_DATA="${CAESAROS_DATA:-$HOME/.local/share/caesaros-mine}"
    OWNER="${CAESAROS_OWNER_DIR:-$HOME/caesaros-owner}"
    export CAESAROS_SKILLS_DIR="${CAESAROS_SKILLS_DIR:-$ROOT/skills:$HOME/.hermes/skills:$OWNER/skills}"       # a separate private repo, never inside this one
    if [ -d "$OWNER" ]; then export CAESAROS_MODULE_DIRS="plugins,$OWNER"; else export CAESAROS_MODULE_DIRS="plugins"; echo "caesaros: no owner layer at $OWNER, running with the core modules only"; fi ;;
  *) echo "usage: tools/run-instance.sh clean|mine" >&2; exit 2 ;;
esac
case "$CAESAROS_DATA" in "$ROOT"/*) echo "caesaros: refusing: the data folder must live outside the repo ($CAESAROS_DATA)" >&2; exit 3 ;; esac
mkdir -p "$CAESAROS_DATA"
echo "caesaros: $WHICH instance on http://127.0.0.1:$CAESAROS_PORT  data $CAESAROS_DATA"
cd "$ROOT" && exec bun core/server.ts
