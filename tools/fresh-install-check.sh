#!/usr/bin/env bash
# Fresh-install check: take a clean export of HEAD, install it, typecheck it, test it, boot it, and
# hit it. Prints PASS or FAIL per step and exits non-zero if any step failed. It stops only the core
# it started itself; nothing else on the machine is touched.
# Usage: bash tools/fresh-install-check.sh
set -u
cd "$(dirname "$0")/.." || exit 1

TMP=$(mktemp -d)
APP="$TMP/app"
CORE_PID=""
FAILED=0

cleanup() {
  if [ -n "$CORE_PID" ]; then kill "$CORE_PID" 2>/dev/null; wait "$CORE_PID" 2>/dev/null; fi
  rm -rf "$TMP"
}
trap cleanup EXIT

step() { # step <name> <command...>
  local name=$1; shift
  if "$@" >"$TMP/step.log" 2>&1; then
    echo "PASS  $name"
  else
    echo "FAIL  $name"
    tail -n 40 "$TMP/step.log"
    FAILED=1
    return 1
  fi
}

in_app() { ( cd "$APP" && "$@" ); }

echo "== fresh install check from git archive HEAD =="
mkdir -p "$APP" "$TMP/data" "$TMP/hermes"

if ! step "export HEAD" bash -c 'git archive HEAD | tar -x -C "$0"' "$APP"; then
  echo "FAIL  fresh-install: nothing to check without an export"
  exit 1
fi

in_app bun install --frozen-lockfile >"$TMP/install.log" 2>&1 \
  && echo "PASS  bun install --frozen-lockfile" \
  || { echo "FAIL  bun install --frozen-lockfile"; tail -n 40 "$TMP/install.log"; exit 1; }

step "tsc --noEmit" in_app bunx tsc --noEmit
step "bun test tests" in_app bun test tests

# A free port chosen by the OS, so two runs never collide.
PORT=$(bun -e 'const s=require("node:net").createServer();s.listen(0,"127.0.0.1",()=>{const p=s.address().port;s.close(()=>console.log(p))})')
BASE="http://127.0.0.1:$PORT"

( cd "$APP" && exec env CAESAROS_DATA="$TMP/data" CAESAROS_PORT="$PORT" HERMES_HOME="$TMP/hermes" \
  bun core/server.ts ) >"$TMP/core.log" 2>&1 &
CORE_PID=$!

for _ in $(seq 1 60); do
  curl -fsS "$BASE/api/health" >/dev/null 2>&1 && break
  kill -0 "$CORE_PID" 2>/dev/null || break
  sleep 0.5
done

if curl -fsS "$BASE/api/health" | grep -q '"ok":true'; then
  echo "PASS  /api/health answers with an empty data dir"
else
  echo "FAIL  /api/health answers with an empty data dir"
  tail -n 40 "$TMP/core.log"
  FAILED=1
fi

HOME_HTML=$(curl -fsS "$BASE/" 2>/dev/null || true)
if printf '%s' "$HOME_HTML" | grep -q 'href="real.css' && printf '%s' "$HOME_HTML" | grep -q 'src="og.js'; then
  echo "PASS  / returns the Atrium"
else
  echo "FAIL  / returns the Atrium"
  echo "$HOME_HTML" | head -c 200
  FAILED=1
fi

if [ "$FAILED" -eq 0 ]; then echo "PASS  fresh install"; else echo "FAIL  fresh install"; fi
exit "$FAILED"
