#!/usr/bin/env bash
# Installs the local voices (Piper) next to the speech-to-text home (default ~/.local/share/caesaros-speech/tts). Nothing is sent anywhere except the
# downloads (the piper-tts package, and the voice files unless CAESAROS_VOICES_FROM names a folder that already has them). Remove it with: rm -r <dir>/tts
#   bash tools/speech/install-tts.sh             the default voices: pl_PL-gosia-medium and en_US-lessac-medium (about 130 MB)
#   bash tools/speech/install-tts.sh --check     report only: installs nothing; exit 0 when Piper and the default voices are there, 3 when not
# Piper is optional: when it is missing, reading aloud uses the browser's own voice.
set -euo pipefail
MODE=default
for a in "$@"; do case "$a" in --check) MODE=check;; -h|--help) sed -n 2,7p "$0"; exit 0;; *) echo "unknown option $a" >&2; exit 2;; esac; done
HOME_DIR="${CAESAROS_SPEECH_DIR:-$HOME/.local/share/caesaros-speech}/tts"; V="$HOME_DIR/voices"; VENV="$HOME_DIR/venv"
VOICES="pl/pl_PL/gosia/medium en/en_US/lessac/medium"
file_of() { IFS=/ read -r l r n q <<< "$1"; echo "$r-$n-$q"; }
have_voice() { [ -s "$V/$1.onnx" ] && [ -s "$V/$1.onnx.json" ]; }
have_piper() { [ -x "$VENV/bin/python" ] && "$VENV/bin/python" -c "import piper" >/dev/null 2>&1; }
missing=""; have_piper || missing="piper-tts ($VENV)"
for v in $VOICES; do f="$(file_of "$v")"; have_voice "$f" || missing="$missing $f"; done
if [ "$MODE" = check ]; then
  if [ -z "$missing" ]; then echo "ok: Piper and the default voices are installed ($HOME_DIR)"; exit 0; fi
  echo "missing: $missing"; echo "install with: bash tools/speech/install-tts.sh   (reading aloud uses the browser voice until then)"; exit 3
fi
mkdir -p "$V"
if ! have_piper; then
  if command -v uv >/dev/null 2>&1; then uv venv -q --python 3.12 "$VENV" && VIRTUAL_ENV="$VENV" uv pip install -q piper-tts
  else PY="$(command -v python3.12 || true)"; [ -x "$PY" ] || { echo "need python 3.12 or uv"; exit 1; }; "$PY" -m venv "$VENV" && "$VENV/bin/pip" install --quiet --upgrade pip piper-tts; fi
fi
HF=https://huggingface.co/rhasspy/piper-voices/resolve/main
for v in $VOICES; do
  IFS=/ read -r l r n q <<< "$v"; f="$r-$n-$q"
  for e in onnx onnx.json; do
    [ -s "$V/$f.$e" ] && continue
    if [ -n "${CAESAROS_VOICES_FROM:-}" ] && [ -s "$CAESAROS_VOICES_FROM/$f.$e" ]; then cp "$CAESAROS_VOICES_FROM/$f.$e" "$V/$f.$e"
    else curl -fsSL -o "$V/$f.$e.part" "$HF/$l/$r/$n/$q/$f.$e" && mv "$V/$f.$e.part" "$V/$f.$e" || { rm -f "$V/$f.$e.part"; exit 1; }; fi
  done
done
echo "ok: $HOME_DIR (default voices). Reading aloud offers them when they are there."
