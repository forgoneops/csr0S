#!/usr/bin/env bash
# Build the release tarball from a neutral path so no username or checkout path is baked into the binaries.
# git archive HEAD -> /tmp/csr-build, a fresh `bun install`, tools/package-linux.sh there, the tarball copied back to dist/.
# Then the binaries are scanned for the home directory and the build fails if one is found.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
B=/tmp/csr-build; rm -rf "$B"; mkdir -p "$B"
(cd "$ROOT" && git archive HEAD) | tar -x -C "$B"
cd "$B"; bun install --frozen-lockfile >/dev/null
bash tools/package-linux.sh
mkdir -p "$ROOT/dist"; cp dist/caesaros-linux-x64.tar.gz "$ROOT/dist/"
X="$(mktemp -d)"; tar -xzf dist/caesaros-linux-x64.tar.gz -C "$X"
bad=0; for f in $(find "$X" -type f \( -name 'caesaros-core' -o -name 'caesaros-shell' \)); do
  if strings -a "$f" | grep -q "$HOME"; then echo "home path inside $(basename "$f"):"; strings -a "$f" | grep "$HOME" | head -3; bad=1; fi
done
rm -rf "$X"; [ "$bad" = 0 ] || { echo "package-clean: a home path is still in a binary"; exit 1; }
sha256sum "$ROOT/dist/caesaros-linux-x64.tar.gz"; echo "package-clean: ok"
