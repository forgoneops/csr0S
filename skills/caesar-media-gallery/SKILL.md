---
name: caesar-media-gallery
description: "Use when changing the Media Gallery (the Archive, /media) or working with its files: the launcher, folders, thumbnail and list views, Choose mode, rename, Trash, hand-mode and gamepad control, adding a review video, art assets. Also when the operator says gallery, galeria, Archiwum or folder w galerii."
---

# Media Gallery (the Archive)

The page is `/media` (plugin `media`, all in `plugins/media/`: `client.tsx` routes /media and /media/view; `gallery.tsx`, `launcher-view.tsx` and `launcher.ts` (pure logic, tested), `tree.ts`, `viewer.tsx`, `client.css`; the server is `server.ts`). The old 2.5D walk-through hall is gone (2026-11-04); its picture `scene-archive-<accent>` is now the backdrop of the launcher.

## What it is
- **Launcher** (`MediaLauncher`): a row of rounded tiles over the hall picture, one per place (All media, Generated art, Public art, Agent workspace, Library, Trash) with a count and a picture. The focused tile grows and glows. Keys: left and right, Home and End, Enter opens, Esc goes back to All media. A gamepad works too (d-pad or stick, A and B). Hand mode drives it through `caesar:spin`. Motion off or reduced motion: same row, nothing moves. Pure logic with tests is in `media-launcher.ts`.
- **File manager** below it: real nested folders (up to 8 levels) with breadcrumbs and folder tiles you open; **Thumbnails or List** (List has a preview pane; the choice is remembered per folder); **Choose** mode puts a check box in the corner of every file and folder, with Choose all, Move, Trash, Rename folder and Look; **rename** of a file or folder from the gallery (F2, the Rename button, double click on a card name; the extension stays unless the new one is the same kind; a taken name is refused); drag and drop into folders; stacks; Trash is reversible.
- **Desktop and mobile have the same functions.** Shortcuts (F2, double click, drag) are extras; every action has a visible button that works by touch. Keep it that way.
- Server: `plugins/media/` (`POST /library/rename` for files, `/library/folder/*` for folders, `/library/move`, `/library/import`, `/trash`). The `media` switch in `themes/hexameter/theme.json` turns the motion off.

## Driving it from outside (hand mode, gamepad, voice)
Send a window event; nothing else is needed:
`window.dispatchEvent(new CustomEvent("caesar:spin", { detail }))` with `{ step: 1 | -1 }` (walk one stop), `{ select: n }` (walk to item n) (`degrees` is ignored by the launcher). Hand mode sends `step` on a flick: it moves the focus along the row.

## Adding a local review video
1. Keep the source artifact intact. If it is already indexed from a read-only source, use the gallery's **Copy to library** action. If it is outside the fixed index roots, make a byte-for-byte copy under `data/plugins/media/library/<folder>/`; refuse to overwrite an existing destination and verify the source and copy hashes. Do not move the source, use symlinks, or put a private review cut in `web/public/art/`, which is the static public-art root.
2. Use the gallery's folder-creation flow when a named folder helps (for example, `Promo 2026`). The folder API is `POST /api/p/media/library/folder`; then read back `GET /api/p/media/index` and confirm the item is `source: library`, `kind: video`, `mime: video/mp4`, with the expected relative path and size.
3. Verify serving, not just indexing: request `/api/p/media/file` with `source=library` and the encoded relative path; check `Content-Type: video/mp4`, byte-range support (`206` with `Content-Range`), and, when exact-copy integrity matters, hash the full served body against the source.
4. Find the new item in the Library folder (List view or search) and open it from there.
5. Open the original from the gallery. For video, confirm the native controls and loaded metadata/duration; for images, confirm the loaded image and natural dimensions. An index entry or working API response alone does not prove browser playback/rendering. If browser playback cannot be verified, say so explicitly.

## Confirming a new art asset appears
1. Keep the master in `art/raw/`; verify the tinted output in `art/out/` and the copy in `web/public/art/`. The gallery indexes those output roots, not `art/raw/`.
2. Read the media index to confirm each expected `source` and filename, but treat that only as indexing evidence, not proof the art is visible.
3. Open the served `/media` route in a real browser, wait for the gallery to settle, search by the exact filename, and inspect the grid and the list. For the boot gate, wait until it says `TOUCH CAESAR TO ENTER` and click the actual CAESAR mark (`.boot-mark`); clicking the overlay while it is still waking only skips the sequence and does not enter.
4. Check it in the Thumbnails and the List view; use search if it is not on the first screen.
5. Open the original from the gallery and verify the actual loaded image and natural dimensions. A filename or API result alone cannot prove that the correct variant is rendered.

Report the direct `/media` link and the item's library folder/path so the operator can open it immediately; distinguish a locally indexed review copy from anything published or shared.

## Rules
- Read-only sources stay read-only; removals go to reversible Trash (see `plugins/media/DESIGN.md`).
- Keep it light: no continuous polling; thumbnails load lazily.
- Check the launcher, the grid and the list at 1440, 768 and 375 px; include motion-off/reduced-motion; verify no control collides with the live bar or chat launcher, and that every action works by touch.
