#!/usr/bin/env bash
# Back up the person's data dir to a place outside every repo. Never into the working tree, never to a public target.
# Usage: tools/backup-data.sh [target-dir]    default ~/caesaros-backups; keeps the newest 14 archives.
set -euo pipefail
DATA="${CAESAROS_DATA:-$HOME/.local/share/caesaros}"; OUT="${1:-$HOME/caesaros-backups}"
[ -d "$DATA" ] || { echo "no data dir at $DATA"; exit 1; }
case "$(realpath "$OUT")" in "$(realpath "$DATA")"*|*/apps/*) echo "refusing: the backup must sit outside the data dir and every repo"; exit 1;; esac
mkdir -p "$OUT"; chmod 700 "$OUT"
F="$OUT/caesaros-data-$(date +%Y%m%d-%H%M%S).tar.zst"
tar --zstd -cf "$F" -C "$(dirname "$DATA")" "$(basename "$DATA")"; chmod 600 "$F"
ls -1t "$OUT"/caesaros-data-*.tar.zst | tail -n +15 | xargs -r rm -f
echo "backup: $F ($(du -h "$F" | cut -f1))"
