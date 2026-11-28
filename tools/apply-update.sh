#!/usr/bin/env bash
# Swap the installed CaesarOS for a staged, checksum-verified package. Started detached by the core (POST /api/update/restart):
#   apply-update.sh <pid of the running shell> <folder of the staged package>
# Waits for the shell to exit, backs the app folder up, runs the package's installer, starts the app again. If the installer fails, the backup is put back.
set -uo pipefail
PID="${1:?pid}"; PKG="${2:?staged package folder}"
APP="${CAESAROS_APP_DIR:-$HOME/.local/share/caesaros-app}"; LOG="${CAESAROS_UPDATE_LOG:-$HOME/.local/share/caesaros/update.log}"
mkdir -p "$(dirname "$LOG")"; exec >>"$LOG" 2>&1; echo "== $(date -u +%FT%TZ) update to $PKG"
[ -f "$PKG/install.sh" ] || { echo "no installer in $PKG, nothing changed"; exit 1; }
for _ in $(seq 1 40); do kill -0 "$PID" 2>/dev/null || break; sleep 0.5; done
kill -0 "$PID" 2>/dev/null && { echo "the app did not exit, nothing changed"; exit 1; }
BAK="$APP.bak-$(date -u +%Y%m%dT%H%M%S)-$$"; [ -e "$BAK" ] && { echo "backup path exists, nothing changed"; exit 1; }; cp -a "$APP" "$BAK" || { echo "backup failed, nothing changed"; exit 1; }
if bash "$PKG/install.sh"; then echo "installed, backup at $BAK"; else echo "installer failed, restoring"; rm -rf "$APP"; mv "$BAK" "$APP"; fi
if [ -z "${CAESAROS_NO_START:-}" ]; then setsid -f "$APP/caesaros-shell" >/dev/null 2>&1 < /dev/null; fi
