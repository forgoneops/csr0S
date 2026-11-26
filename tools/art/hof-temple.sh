#!/usr/bin/env bash
# The Hall of Fame backdrop: a dark haze with a warm floor and violet ceiling, drawn with ImageMagick.
# No figures and no architecture in it — the keepers are 3D holograms in front of this.
# Run from the repo root: tools/art/hof-temple.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
OUT=web/atrium/art/hof-temple.webp
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT

magick -size 1680x840 gradient:'#120c18-#030305' "$TMP/0.png"
magick "$TMP/0.png" \
  -fill 'rgba(255,150,70,0.10)' -draw 'ellipse 840,900 700,300 0,360' \
  -fill 'rgba(120,90,200,0.07)' -draw 'ellipse 840,120 800,260 0,360' \
  -channel RGB -blur 0x40 +channel "$TMP/1.png"
magick "$TMP/1.png" -attenuate 0.35 +noise Gaussian -blur 0x0.5 \
  \( -size 1680x840 radial-gradient:'rgba(0,0,0,0)-rgba(0,0,0,0.9)' \) -compose multiply -composite \
  -background '#000' -alpha remove -alpha off -colorspace sRGB -quality 82 "$OUT"
identify "$OUT"
