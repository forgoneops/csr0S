#!/usr/bin/env bash
# One pre-commit hook for the clean repo: the leak check must pass before any commit. Run once after cloning.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOOK="$(git -C "$ROOT" rev-parse --git-path hooks)/pre-commit"
mkdir -p "$(dirname "$HOOK")"
printf '#!/usr/bin/env bash\ncd "$(git rev-parse --show-toplevel)" && bun tools/leak-check.ts\n' > "$HOOK"
chmod +x "$HOOK"; echo "installed: $HOOK"
