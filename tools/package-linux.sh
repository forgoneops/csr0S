#!/usr/bin/env bash
# Build a self-contained CaesarOS for Linux x86_64: the native window, the core as one executable, and the app's files.
# No Bun, Node or source tree is needed to run the result. Usage: tools/package-linux.sh   ->  dist/caesaros-linux-x64.tar.gz
# Needs to build: Bun, Rust (cargo), webkit2gtk-4.1 development files.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"; cd "$ROOT"
OUT="$ROOT/dist/caesaros-linux-x64"; rm -rf "$OUT"; mkdir -p "$OUT/resources/web" "$ROOT/dist"
echo "1/4 web"; bunx vite build web >/dev/null
echo "2/4 core (one executable)"; bun build core/server.ts --compile --outfile "$OUT/caesaros-core" >/dev/null
echo "3/4 native window"; (cd src-tauri && cargo build --release -q) ; cp src-tauri/target/release/caesaros-shell "$OUT/caesaros-shell"
echo "4/4 files"
cp -r web/atrium web/dist "$OUT/resources/web/"; cp -r packs skills "$OUT/resources/"; cp LICENSE THIRD-PARTY-NOTICES.md README.md "$OUT/"
cp src-tauri/icons/128x128.png "$OUT/caesaros.png"
cat > "$OUT/caesaros.desktop" <<D
[Desktop Entry]
Type=Application
Name=CaesarOS
Comment=A local-first workspace for AI agents
Exec=@DIR@/caesaros-shell
Icon=@DIR@/caesaros.png
Categories=Utility;Development;
Terminal=false
D
cat > "$OUT/install.sh" <<'I'
#!/usr/bin/env bash
# Puts CaesarOS in ~/.local/share/caesaros-app and adds it to the application menu. Remove it by deleting that folder and the .desktop file.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; DEST="$HOME/.local/share/caesaros-app"
rm -rf "$DEST"; mkdir -p "$DEST" "$HOME/.local/share/applications"; cp -r "$HERE"/. "$DEST"/
sed "s#@DIR@#$DEST#g" "$HERE/caesaros.desktop" > "$HOME/.local/share/applications/caesaros.desktop"
echo "Installed. Find CaesarOS in the application menu, or run $DEST/caesaros-shell"
I
chmod +x "$OUT/install.sh" "$OUT/caesaros-shell" "$OUT/caesaros-core"
tar -C "$ROOT/dist" -czf "$ROOT/dist/caesaros-linux-x64.tar.gz" caesaros-linux-x64
du -h "$ROOT/dist/caesaros-linux-x64.tar.gz"
