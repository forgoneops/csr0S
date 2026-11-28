#!/usr/bin/env bash
# Build a self-contained CaesarOS for Linux x86_64: the native window, the core as one executable, and the app's files.
# No Bun, Node or source tree is needed to run the result. Usage: tools/package-linux.sh   ->  dist/caesaros-linux-x64.tar.gz
# Needs to build: Bun, Rust (cargo), webkit2gtk-4.1 development files.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"; cd "$ROOT"
OUT="$ROOT/dist/caesaros-linux-x64"; rm -rf "$OUT"; mkdir -p "$OUT/resources/web" "$ROOT/dist"
echo "1/4 web"; bunx vite build web >/dev/null
echo "2/4 core (one executable)"; bun build tools/compile-entry.ts --compile --outfile "$OUT/caesaros-core" >/dev/null
echo "3/4 native window"; (cd src-tauri && RUSTFLAGS="${RUSTFLAGS:-} --remap-path-prefix=$HOME=/build --remap-path-prefix=$ROOT=/src" cargo build --release -q) ; cp src-tauri/target/release/caesaros-shell "$OUT/caesaros-shell"
echo "4/4 files"
cp -r web/atrium web/dist "$OUT/resources/web/"; cp -r packs skills "$OUT/resources/"; mkdir -p "$OUT/resources/core"; cp -r plugins "$OUT/resources/plugins"; rm -rf "$OUT/resources/plugins/hello"; cp -r core/modules "$OUT/resources/core/modules"; while IFS= read -r x; do case "$x" in skills/*) rm -rf "$OUT/resources/$x";; esac; done < tools/clean-exclude.txt; mkdir -p "$OUT/resources/tools/speech"; cp -r tools/speech/. "$OUT/resources/tools/speech/"; cp tools/caesar-computer-mcp.ts "$OUT/resources/tools/"
cp LICENSE THIRD-PARTY-NOTICES.md README.md "$OUT/"
cp src-tauri/icons/caesar.png "$OUT/caesaros.png"
cat > "$OUT/caesar.desktop" <<D
[Desktop Entry]
Type=Application
Name=Caesar
GenericName=AI agent workspace
Keywords=caesar;caesaros;agent;ai;hermes;brain;
Comment=A local-first workspace for AI agents
Exec=@DIR@/caesaros-shell
Icon=@DIR@/caesaros.png
Categories=Utility;
Terminal=false
D
cat > "$OUT/install.sh" <<'I'
#!/usr/bin/env bash
# Puts CaesarOS in ~/.local/share/caesaros-app and adds it to the application menu. Remove it by deleting that folder and the .desktop file.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; DEST="$HOME/.local/share/caesaros-app"
rm -rf "$DEST"; mkdir -p "$DEST" "$HOME/.local/share/applications"; cp -r "$HERE"/. "$DEST"/
rm -f "$HOME/.local/share/applications/caesaros.desktop"; sed "s#@DIR@#$DEST#g" "$HERE/caesar.desktop" > "$HOME/.local/share/applications/caesar.desktop"
echo "Installed. Find CaesarOS in the application menu, or run $DEST/caesaros-shell"
I
chmod +x "$OUT/install.sh" "$OUT/caesaros-shell" "$OUT/caesaros-core"
tar -C "$ROOT/dist" -czf "$ROOT/dist/caesaros-linux-x64.tar.gz" caesaros-linux-x64
du -h "$ROOT/dist/caesaros-linux-x64.tar.gz"
