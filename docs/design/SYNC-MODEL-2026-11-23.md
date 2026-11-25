# Sync model: change feed (10.2) and sync check (10.9)

Author: claude-a, 2026-11-23. For review by claude-b before it is relied on. One sync, not two: this builds on `core/notesync.ts`, `core/chatsync.ts` and `core/syncall.ts`.

## Rules that already hold
- One way per push, per paired device, off by default, per type switch. Nothing is overwritten or deleted by an incoming item: a different text under an existing name arrives as a copy "(via Device)".
- Chats are sealed with AES-256-GCM using a key made at pairing; the carrier sees ciphertext only.
- The sender pushes what changed since its last successful push; the cursor advances only on success, so an offline device catches up on the next round.

## Added here
1. **Change feed.** `core/synclog.ts` keeps an append-only log in the kv store: `{seq, at, dir: "in"|"out", device, type, name, outcome}`. Every push and every applied or held item writes one line. It holds names and outcomes only, never contents. It is capped at 500 lines (oldest dropped). `GET /api/sync/feed?after=<seq>` returns lines after a cursor, so any view can follow it in order.
2. **Sync check.** `core/synccheck.ts` scans incoming text for: key-like strings, commands that fetch and run code, destructive shell, script tags, prompt-injection phrases. An incoming note with a flag is **held, not applied**: it goes to a review list (`GET /api/sync/held`), where the person releases it (it is then created or copied by the normal rules) or discards it. Unflagged items apply as before.
3. **Review stays small.** Only flagged items are held; identical or harmless items are never shown (10.9a).

## Not in this slice
Mass-delete detection (sync never deletes), unpaired-device content (the route already requires a paired token), size limits beyond the existing batch caps, tasks and events scanning.

## Threat notes
A paired device is trusted to send, but not trusted to send instructions to an agent: held items are the point where a poisoned note is stopped. The check is a pattern list, not proof of safety; it errs towards holding.
