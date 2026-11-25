#!/usr/bin/env bash
# One command to run CaesarOS as a desktop app: builds what is missing (web app, native shell), then starts the
# shell, which starts the local core by itself and stops it when the window closes.
# Usage: tools/run-desktop.sh            (or: bun run desktop)
# Env:   CAESAROS_DATA   where your settings, notes and chats live (default ~/.local/share/caesaros, outside the repo)
#        PROFILE         release (default) or debug
#        REBUILD=1       rebuild the web app and the shell even if they exist
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROFILE="${PROFILE:-release}"
export CAESAROS_DATA="${CAESAROS_DATA:-$HOME/.local/share/caesaros}"
mkdir -p "$CAESAROS_DATA"

say() { printf 'caesaros: %s\n' "$*"; }
need() { command -v "$1" >/dev/null 2>&1 || { say "missing $1: $2"; exit 2; }; }
need bun "install bun (https://bun.sh)"
need cargo "install Rust (https://rustup.rs)"
pkg-config --exists webkit2gtk-4.1 2>/dev/null || { say "missing webkit2gtk-4.1 development files (Arch: pacman -S webkit2gtk-4.1)"; exit 2; }
[ -d "$ROOT/node_modules" ] || { say "installing dependencies"; (cd "$ROOT" && bun install); }

# A core that is already listening may predate the code on disk (e.g. a settings field added since): the app would then
# quietly talk to old code. Refuse and say why; never stop a core this script did not start. CAESAROS_ATTACH_OLD=1 overrides.
PORT="${CAESAROS_PORT:-4410}"
if curl -sf --max-time 2 "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
  # no startedAt at all means a core older than this check, so older than the code too
  STARTED="$(curl -sf --max-time 2 "http://127.0.0.1:$PORT/api/version" 2>/dev/null | grep -o '"startedAt":[0-9]*' | cut -d: -f2 || true)"
  NEWER="$(find "$ROOT/core" "$ROOT/plugins" "$ROOT/owner" -name '*.ts' -newermt "@$(( ${STARTED:-0} / 1000 ))" -print -quit 2>/dev/null || true)"
  if [ -n "$NEWER" ] && [ "${CAESAROS_ATTACH_OLD:-0}" != "1" ]; then
    PID="$(ss -ltnp 2>/dev/null | grep ":$PORT " | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2 || true)"
    say "a core on port $PORT (pid ${PID:-?}) started before ${NEWER#"$ROOT"/} changed, so it runs older code than this checkout."
    say "stop it yourself and run this again (I will not stop a core I did not start), or set CAESAROS_ATTACH_OLD=1 to use it anyway."
    exit 3
  fi
  say "attaching to the core already running on port $PORT"
fi
[ "${CHECK_ONLY:-0}" = "1" ] && exit 0

stale_web() { [ -n "$(find "$ROOT/web/src" "$ROOT/web/public" "$ROOT/web/index.html" "$ROOT/web/vite.config.ts" -newer "$ROOT/web/dist/index.html" -print -quit 2>/dev/null)" ]; }
if [ "${REBUILD:-0}" = "1" ] || [ ! -f "$ROOT/web/dist/index.html" ] || stale_web; then
  say "building the web app"; (cd "$ROOT" && bun run build)
fi

FLAGS=(); [ "$PROFILE" = "release" ] && FLAGS=(--release)
BIN="$ROOT/src-tauri/target/$PROFILE/caesaros-shell"
if [ "${REBUILD:-0}" = "1" ] || [ ! -x "$BIN" ]; then
  say "building the native shell ($PROFILE); the first build takes a few minutes"
  cargo build --manifest-path "$ROOT/src-tauri/Cargo.toml" "${FLAGS[@]}"
fi

say "starting; your data is in $CAESAROS_DATA"
cd "$ROOT"                                  # the shell finds core/server.ts from here and starts the local core itself
export CAESAROS_CORE_DIR="$ROOT"
exec "$BIN" "$@"
