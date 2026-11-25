---
name: caesar-studio-merge
description: "Use when deciding whether two or more CaesarOS tools or Off Grid functions should become one studio, or where a new tool belongs in the menu. Also: 'polacz narzedzia', 'merge tools', 'studio', 'duplikat funkcji'."
---

# Merging similar tools into studios

Rule (Konrad, 2026-11-22): Off Grid Desktop is the base for every aspect; take its solution where we lack one; where both have the same thing, merge them into one better version; similar tools of ours become one studio.

## Run the overlap
1. List the tools (`plugins/*/plugin.json` of the cockpit repo, `name` and `description`) and Off Grid's functions (`docs/design/AUDIT-FULL-OGAD-CAESAR-VS-CAESAROS-2026-11-22.md`).
2. For each tool ask Jev one choice question: which Off Grid function does it overlap with, or none (see `docs/design/STUDIO-MERGE-MAP-2026-11-22.md` for the list used). Jev only answers choices, scores and yes/no; it writes nothing. Use it only when the owner names it in the turn; it costs fractions of a cent and has a daily cap.
3. Accept answers at 60 percent confidence or more; decide the rest yourself and say so. Expect a few wrong ones (it called Praetorium "health").

## Decide
- Same function: one surface, Off Grid's flow first, our additions on top.
- No Off Grid counterpart: keep it, but give it a studio (Web, Content, Dev, Business) with tabs, not a separate menu entry.
- Chat, Search, Terminal and Approvals are the frame, not studios.
- Each group opens as a hub of live widgets (move, resize, remove, add); "View all" goes deeper.

## Then
Update the merge map, then the plan, then build the hub. A tool joins a studio as a module on the existing mechanism so the clean instance can leave owner-only ones out.
