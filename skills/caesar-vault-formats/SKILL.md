---
name: caesar-vault-formats
description: "Use before writing or changing any note in the CAESAR vault (backend) or an Obsidian-compatible file: how notes, links, properties, embeds, callouts, .base views and .canvas files must look so the vault opens cleanly in Obsidian and in CAESAR. Rules adapted from kepano/obsidian-skills (MIT)."
---

# Vault formats

The vault is plain files, Obsidian-compatible. Write them so both CAESAR and Obsidian read them the same way. Source of the format rules: `kepano/obsidian-skills` (MIT), adapted. Never edit an owner's note without his consent (see the brain skill); these rules are for the notes you may write.

## Note
1. **Properties first** (YAML front matter): `title`, `tags` (list), `aliases` (list), `date` as `YYYY-MM-DD`. Keep CAESAR's own lines (`updated_by`, `updated`, `agent_sig`) untouched: they are written by the vault, not by you.
2. **One `# Title`** as the first heading after the properties. Titles are how people and links find the note.
3. **Links:** `[[Note]]`, `[[Note|text]]`, `[[Note#Heading]]`, `[[Note#^block-id]]` for notes in the vault; `[text](https://…)` only for the web. A link points at a note that exists; propose the note first when it does not.
4. **Embeds:** `![[Note]]`, `![[Note#Heading]]`, `![[image.png|300]]`, `![[file.pdf#page=3]]`.
5. **Callouts:** `> [!note]`, `> [!warning] Title`, foldable with `-` or `+` (`> [!faq]- Title`). Types: note, tip, warning, info, example, quote, bug, danger, success, failure, question, abstract, todo.
6. **Tags:** `#tag`, `#nested/tag` (letters, digits not first, `_ - /`). Prefer the `tags` property.
7. **Comments** `%%hidden%%`, highlights `==text==`, block id `^id` after a paragraph.
8. Facts the crew remembers go in `facts/`, one short topic per note; sessions and imports stay under `imported/` or `raw/` and are read as they are.

## `.base` (database view of notes)
Valid YAML, extension `.base`: `filters` (single string or one of `and` / `or` / `not`), `formulas`, `properties` (display names), `summaries`, `views` (`table`, `cards`, `list`, `map`) each with `order`. Operators `== != > < >= <= && || !`; helpers like `file.hasTag("x")`, `file.inFolder("Y")`, `file.hasLink("Z")`. Quote strings that hold YAML characters. Check every referenced property and formula exists.

## `.canvas` (JSON Canvas 1.0)
`{"nodes": [], "edges": []}`. Node: `id` (16 hex chars, unique across nodes and edges), `type` (`text`, `file`, `link`, `group`), `x`, `y`, `width`, `height`, optional `color` ("1" to "6" or hex); `text` nodes hold Markdown, `file` nodes a vault path (+ optional `#subpath`), `link` nodes a `url`. Edge: `id`, `fromNode`, `toNode`, optional `fromSide`/`toSide` (top, right, bottom, left) and `label`. Leave 50 to 100 px between nodes. Line breaks in JSON are `\n`, never a literal backslash-n. After any edit check that ids are unique and every `fromNode`/`toNode` exists.

## Checks before you finish
- Front matter parses; the title heading exists; every `[[link]]` resolves (use `brain_lint`).
- No secret, key or token in the text (the vault refuses them).
- A change to an existing note you do not own is a pending proposal (`brain_propose`), not an applied write. Never report the target or queue as updated until the operator accepts the proposal and a readback of that target shows the change. When reporting a proposal, state the exact review route, `Tabularium > Curator`, and the note path; do not promise a visible card or invent a link when the tool returns none.

## Brain MCP write behavior
- Before writing, determine the active Brain destination. Check whether `data/plugins/brain/hub.json` or `CAESAR_BRAIN_HUB` routes the MCP to a non-local host; inspect only the routing state and never print host or key values. If the task forbids remote/VPS changes, do not call `brain_write` or `brain_propose` through that route. Stop and report the blocker, or use a user-approved local-only destination; never edit vault files directly to bypass the hub.
- Treat `brain_write` as the only vault writer. It injects vault-owned fields (`created_by`, `updated`, `agent_sig`) and may normalize away caller-supplied YAML properties such as `title`, `tags`, `aliases`, `date`, or session `type`. Always read back after writing; if a field does not survive, do not bypass the Brain backend by editing vault files directly. Preserve the H1 and links, record the limitation, and use `brain_propose` for owner notes as required.
- Verify a proposal through the same Brain instance that created it. The shared Brain MCP and a local CAESAR `/api/p/brain/curator` may address different vaults; an empty local result does not prove a shared proposal failed. If you cannot read back the proposal or the target, report visibility as unverified and leave the note unchanged; never retry through a raw path or alternate API.

Idea parked: export the Map as a `.canvas` file so the owner can open it in Obsidian.
