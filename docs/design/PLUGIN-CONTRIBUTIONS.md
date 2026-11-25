# Plugin contributions (R54)

Branch `shell/r54-plugin-contributions`, from `origin/shell/appearance-packs` at `f2431f7`. Nothing deployed,
nothing restarted outside the cores started for the browser pass, no `main`, no push.

A module today is a manifest (`plugins/<id>/plugin.json`) plus an optional `server.ts`. This adds what a
manifest can put into the shell itself: a Settings row, a live-bar item in the system capsule, and a command
in the small command list (Ctrl+K). All three are **data in the manifest**. The shell reads them through
`GET /api/plugins/all` and renders them with fixed components, so adding, changing or removing a contribution
needs no `vite build`, no new React page and no shell code change.

## What a manifest may declare

```json
{
  "id": "contrib-demo",
  "edition": "standard",
  "defaultOff": true,
  "permissions": ["demo"],
  "contributions": {
    "actions":  [{ "id": "bump", "label": "Bump", "path": "/bump", "permission": "demo" }],
    "status":   [{ "id": "pings", "label": "Pings", "icon": "info", "read": "/status", "intervalMs": 5000 }],
    "settings": [{ "id": "counter", "title": "Contributions demo", "label": "One row from a manifest",
                   "description": "…", "icon": "tag", "read": "/status", "action": "bump" }],
    "commands": [{ "id": "bump", "label": "Demo: bump the counter", "hint": "contrib-demo",
                   "icon": "command", "action": "bump" }]
  }
}
```

| Field | Meaning |
|---|---|
| `contributions.settings[]` | A row on the Settings page: `id`, `title`, optional `label`, `description`, `icon` (a role, never a file), optional `read` (its state) and optional `action` (its visible button). |
| `contributions.status[]` | A live-bar item in the capsule: `label`, optional `icon`, `read` path, `intervalMs` (5 000 to 600 000, default 30 000). The shell shows at most three, in manifest order. |
| `contributions.commands[]` | A command in the Ctrl+K list: `label`, optional `hint` and `icon`, and exactly one of `action` (a declared action id) or `path` (an app route to open). |
| `contributions.actions[]` | The named actions a contribution may run: `id`, `label`, `path`. This is the curated set; nothing outside it can be called. |
| `permission` (on any item) | When present, the core drops the item unless the same word is in the manifest's `permissions`. |
| `defaultOff` | The module is found but not started until the person switches it on (`settings.enabledModules`). A dev fixture uses this. |

Validation is in `core/schema.ts` (`PluginManifest`, `contributions`): an item may not reference an action that
is not declared, ids must be unique inside a surface, a command needs an action or a path, and every path is
relative to the module namespace (`/^\/[a-z0-9/_-]*$/`, no scheme, no `..`). A bad manifest is reported and the
module is not loaded, exactly as before.

## Capability tiers

| Tier | What it is | Who may call it |
|---|---|---|
| **read** | A GET on a declared path, inside the module's own namespace: `/api/p/<id><read>`, answering `{ "value": string, "tone"?: "ok" \| "warn" \| "off" }`. | The shell, for a status item or a Settings row. Read-only. |
| **action** | A POST on a declared action path: `/api/p/<id><action.path>`. The button and the command call it; the module decides what it does. | The shell, and only for ids declared in `contributions.actions`. |
| **api** | The module's own namespaced door `/api/p/<id>/`, as today. Its own permission checks (`privateScope`, tokens) still apply. | The module itself and its own callers. Contributions never get a path the manifest did not declare. |

The shell never writes outside `/api/p/<id>/`, never passes free text to a command and never evaluates plugin
code in the page. A failed read or action is shown as "not answered"; it is never invented.

## Gates

- **Permissions:** every contribution is filtered through the manifest's own `permissions` list
  (`visibleContributions` in `core/schema.ts`). An item naming `"vault"` disappears when the manifest only lists
  `"demo"` — the fixture exercises both.
- **Edition:** an `owner` module is never started in a consumer build (`leftOutOfEdition`, `CAESAROS_EDITION=standard`).
  Its `contributions` are then empty and its routes answer 404. A manifest without `edition` still counts as owner.
  `ModuleInfo.available` is false there, so the Modules page shows its switch disabled ("Not in this edition") and
  `setEnabled` answers `unavailable` without writing settings: a switch that can never work is not offered.
- **Disabled:** `running` is the only switch the surfaces read. Switching a module off pauses its `Life` (timers and
  listeners stopped), its routes answer 404, and `/api/plugins/all` reports empty contributions. The shell renders
  from the store, so the row, the capsule item and the command leave the DOM in the same update; the status item's
  `setInterval` is cleared on unmount. Nothing polls a disabled module (measured: 0 requests in 6.5 s).

## Where it lives

| Piece | File |
|---|---|
| Schema, action/id validation, permission filter | `core/schema.ts` |
| Manifest loading, `defaultOff`, contributions in `ModuleInfo` | `core/plugins.ts` |
| `enabledModules` in settings and the toggle route | `core/schema.ts`, `core/server.ts` |
| Capsule item and Settings row, read hook with cleanup | `web/src/shell/Contributions.tsx` |
| Command list (Ctrl+K and the top-bar button) | `web/src/shell/Palette.tsx`; wired in `web/src/shell/App.tsx` |
| Styles (theme's `.panel.frame` dresses the palette; capsule item is plain state) | `web/src/base.css` |
| English and Polish shell strings | `web/src/i18n.ts` |
| Fixture: one item per surface, off by default | `tests/fixtures/plugins/contrib-demo/` |
| Fixture: owner-only, must not register in a consumer build | `tests/fixtures/plugins/owner-only/` |
| Tests | `tests/plugin-contributions.test.ts` |

## Limits (deliberate)

- Strings that a module ships (row titles, labels, hints) are the module's own data; a module that wants both
  languages declares its own wording. The shell's frame strings are in `i18n.ts`, EN and PL.
- Three status items at most; a fourth would push the capsule over the top bar on a phone.
- Status values are short text (`max-width` 7ch); a long value is ellipsised in the capsule, never wrapped.
- A module that was never started at boot needs a restart to start (the existing registry rule). A `defaultOff`
  fixture therefore appears after the person turns it on and the core restarts, never after a web rebuild.

## How it was verified

- `tests/plugin-contributions.test.ts`: defaultOff found but off; one item per surface when running; a
  permission-dropped item absent; read and action answer; after switch-off the contributions are empty, routes
  404, and neither the 1 s timer nor the event listener moves; owner-only in `CAESAROS_EDITION=standard` is not
  started and registers nothing; broken manifests rejected.
- A real browser (`CAESAROS_PORT=4431`, own data dir, fixture included via `CAESAROS_MODULE_DIRS`) at 1440×900
  and 1100×700, 390×844, themes Neo Roma, Lumen, Cinder, EN and PL, Motion Full and Off: the capsule showed
  `PINGS` and its value, the top-bar button and Ctrl+K opened the list, Enter ran the command and the value moved,
  the Settings row showed its state with Refresh and Bump, the status item polled twice in 6.2 s, and after the
  Modules page switch-off there were 0 items, 0 commands, 0 requests to the module namespace in 6.5 s and a 404.
  Screenshots: `docs/design/captures/plugin-contributions-2026-11-22/`.
- A second core with `CAESAROS_EDITION=standard` reported `owner-only` as not running, `enabled: false`,
  contributions empty, and `/api/p/owner-only/status` 404.