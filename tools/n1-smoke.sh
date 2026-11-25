#!/usr/bin/env bash
# N1 smoke test: build the Tauri shell, start it, prove the process is still alive after 20 s and did not panic.
# Usage: tools/n1-smoke.sh [seconds]        (default 20)
#        BUILD=0 tools/n1-smoke.sh          reuse the last build
# Env:   ALIVE_SECONDS, BUILD, SMOKE_XVFB=1 (wrap in xvfb-run when there is no display)
# Exit:  0 alive, 1 build/run failure, 2 dependencies missing (expected on the VPS, run it on the Lenovo)
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/src-tauri"
SECONDS_ALIVE="${1:-${ALIVE_SECONDS:-20}}"
BUILD="${BUILD:-1}"

say() { printf 'n1-smoke: %s\n' "$*"; }

missing=""
command -v cargo >/dev/null 2>&1 || missing="$missing cargo"
pkg-config --exists webkit2gtk-4.1 2>/dev/null || missing="$missing webkit2gtk-4.1-dev"
if [ -n "$missing" ]; then
  say "missing:$missing"
  say "this is the expected VPS case: the tauri crate needs cargo and the webkit2gtk development packages."
  say "run this on the Lenovo (Hyprland) instead; nothing was built here."
  exit 2
fi

if [ -z "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]; then
  if [ "${SMOKE_XVFB:-0}" = "1" ] && command -v xvfb-run >/dev/null 2>&1; then
    say "no display, re-running under xvfb-run"
    exec env SMOKE_XVFB=0 xvfb-run -a --server-args="-screen 0 1440x900x24" "$0" "$SECONDS_ALIVE"
  fi
  say "no DISPLAY and no WAYLAND_DISPLAY: the shell needs a session (or SMOKE_XVFB=1)"
  exit 2
fi

if [ "$BUILD" = "1" ]; then
  say "building debug ($SRC)"
  cargo build --manifest-path "$SRC/Cargo.toml" || { say "build failed"; exit 1; }
fi

BIN="$SRC/target/debug/caesaros-shell"
[ -x "$BIN" ] || { say "no binary at $BIN (run with BUILD=1)"; exit 1; }

WORK="$(mktemp -d)"
LOG="$WORK/shell.log"
export XDG_CONFIG_HOME="$WORK/config"          # the run never reads or writes the real config
export XDG_DATA_HOME="$WORK/data"
export XDG_CACHE_HOME="$WORK/cache"
export CAESAROS_LOCAL_GATEWAY="http://127.0.0.1:59999"   # nothing listens there: the shell must stay up offline
unset CAESAROS_CORE_DIR CAESAROS_CORE_BIN
mkdir -p "$XDG_CONFIG_HOME" "$XDG_DATA_HOME" "$XDG_CACHE_HOME"
cd "$WORK" || exit 1                              # no core/server.ts here, so no local core is started

say "starting $BIN (offline gateway http://127.0.0.1:59999), expecting it alive after ${SECONDS_ALIVE}s"
"$BIN" >"$LOG" 2>&1 &
pid=$!
sleep "$SECONDS_ALIVE"

status=0
if kill -0 "$pid" 2>/dev/null; then
  say "process $pid is alive after ${SECONDS_ALIVE}s"
else
  wait "$pid"; code=$?
  say "process $pid exited before ${SECONDS_ALIVE}s (code $code)"
  status=1
fi
if grep -qi "panicked at\|thread 'main' panicked" "$LOG"; then
  say "panic found in the log"
  status=1
fi
if grep -q "caesaros-shell: window ready" "$LOG"; then
  say "window reported ready"
else
  say "WARN no 'window ready' line in the log"
fi

if kill -0 "$pid" 2>/dev/null; then
  kill -TERM "$pid" 2>/dev/null
  for _ in 1 2 3 4 5 6 7 8 9 10; do kill -0 "$pid" 2>/dev/null || break; sleep 0.5; done
  kill -0 "$pid" 2>/dev/null && kill -KILL "$pid" 2>/dev/null
fi
wait "$pid" 2>/dev/null

say "--- shell log (first 40 lines) ---"
sed -n '1,40p' "$LOG"
say "--- end of log ---"
if [ "$status" = "0" ]; then say "OK alive ${SECONDS_ALIVE}s, no panic"; else say "FAILED"; fi
exit "$status"
