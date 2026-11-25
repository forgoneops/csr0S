#!/usr/bin/env bash
# One-time system setup for CaesarOS on Arch/Omarchy. It needs root once, and it only does the two things below.
# Run it yourself:   sudo bash tools/setup-system.sh
#  1. Pointer clicks for the Computer page: lets your user write to /dev/uinput (a udev rule and the input group) and installs ydotool.
#  2. The local-model engine for working offline: installs Ollama and starts its service.
# Nothing else is changed. Log out and in once afterwards so the new group applies.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "run with sudo:  sudo bash tools/setup-system.sh" >&2; exit 2; }
U="${SUDO_USER:?run it with sudo from your own user, not as root}"
echo "== 1/2 pointer clicks"
getent group input >/dev/null || groupadd input
usermod -aG input "$U"
printf 'KERNEL=="uinput", MODE="0660", GROUP="input", OPTIONS+="static_node=uinput"\n' > /etc/udev/rules.d/60-caesaros-uinput.rules
udevadm control --reload-rules && udevadm trigger || true
pacman -S --needed --noconfirm ydotool
echo "   done: log out and in once so '$U' is in the input group, then: systemctl --user enable --now ydotool"
echo "== 2. local models"
pacman -S --needed --noconfirm ollama
systemctl enable --now ollama
echo "   done: Ollama is running. CaesarOS > Start now shows the download buttons."
echo "All set."
