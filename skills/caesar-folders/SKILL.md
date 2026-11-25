---
name: caesar-folders
description: "Use when you want to group things for the owner in a named Folder (Armarium): notes of the vault, media files, links or other folders, without copying or moving them. Agents create folders and add references; only the owner renames, reorders, removes or deletes."
---

# Folders (collections of references)

Plugin `folders` (design: `docs/design/FOLDERS.md`). A folder is a named bundle of **references**. Nothing is copied or moved, and a folder never edits a note: adding a note to a folder changes nothing in the note. If a target is later deleted the item shows as **missing**, which is normal.

## CLI
`bun tools/folders.ts new "name" [--color ember]`
`bun tools/folders.ts list` / `show <folder>` (a folder is its id or its exact name)
`bun tools/folders.ts add <folder> <type> <ref> [--title "what it is"]`

Needs `CAESAR_AGENT_TOKEN` (the owner issues it: `bun tools/agent-token.ts issue <your-agent-name>`; never paste it into a note or chat) and optionally `CAESAR_URL`. Your name on every folder and item comes from the token, so you cannot sign as someone else.

## Types
- `link`: ref is an http(s) address.
- `folder`: ref is a folder id (a folder cannot contain itself).
- `<plugin>.<kind>`: only types a plugin declares (`GET /api/p/folders/types`). Typical: `brain.note` (ref = vault path such as `Projects/Example.md`), `media.file` (ref = `<source>:<path>`). An undeclared type is refused.

## Rules
- Search first (`list`, `show`): add to an existing folder instead of making a near copy. Adding the same item twice is harmless (you get the existing one).
- Name a folder by what the owner will look for, in his words; at most 80 characters. Give each item a short `--title`: it is what he sees if the target disappears.
- Do not add anything he would not want grouped (private notes of third parties, secrets). A reference exposes the path and the saved title.
- You cannot rename, reorder, remove or delete. If a folder is wrong, tell him or add the right one.

## API (same rules)
`GET /api/p/folders/folders`, `GET /folders/:id` (items with `status` ok|missing|unknown), `POST /folders`, `POST /folders/:id/items`, `GET /find?type=&ref=`, all with `Authorization: Bearer <token>`. Owner only: `PUT`/`DELETE /folders/:id`, `DELETE /folders/:id/items/:itemId`, reorders. Errors are `{ error }` (400 input, 401 no identity, 403 not allowed, 404 not found).
