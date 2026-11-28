#!/usr/bin/env bash
# Hooks for the clean repo: the leak check before any commit, the data guard before any push. Run once after cloning.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOOK="$(git -C "$ROOT" rev-parse --git-path hooks)/pre-commit"
mkdir -p "$(dirname "$HOOK")"
printf '#!/usr/bin/env bash\ncd "$(git rev-parse --show-toplevel)" && bun tools/leak-check.ts\n' > "$HOOK"
chmod +x "$HOOK"; echo "installed: $HOOK"
PUSH="$(dirname "$HOOK")/pre-push"
printf '#!/usr/bin/env bash\ncd "$(git rev-parse --show-toplevel)" && bun tools/leak-check.ts && bun tools/data-guard.ts\n' > "$PUSH"
chmod +x "$PUSH"; echo "installed: $PUSH"
