#!/usr/bin/env bun
// Import a folder of Markdown notes (an Obsidian vault, the old Brain) into a CaesarOS instance's notes folder, keeping its folders.
// Additive: it never overwrites or deletes anything. A note that already exists with different content gets a numbered name.
// Names are made to fit the core's rules (letters, digits, spaces and _.()- per folder or file name); what changed is listed in the report.
// Dry run by default. Usage:
//   bun tools/import-vault.ts <vault-folder> <instance-data-folder> [--apply]
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, utimesSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const [src, data] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const apply = process.argv.includes("--apply");
if (!src || !data) { console.error("usage: bun tools/import-vault.ts <vault-folder> <instance-data-folder> [--apply]"); process.exit(2); }
const MAX = 1024 * 1024, MAX_NOTES = 5000, MAX_DEPTH = 6;
const dest = join(data, "notes");

/** One path segment in the core's alphabet: other characters become "-", the first must be a letter or digit, at most 80 characters. */
export const cleanSegment = (s: string): string => {
  let t = s.normalize("NFC").replace(/[^\p{L}\p{N} _.()-]/gu, "-").replace(/\.\.+/g, ".").replace(/^[^\p{L}\p{N}]+/u, "").trim().slice(0, 80).trim();
  return t || "Untitled";
};

type Item = { from: string; id: string; changed: boolean };
const items: Item[] = [], skipped: { path: string; why: string }[] = [], taken = new Set<string>();
/** A made-up suffix must still fit the core's 80-character limit per segment, so the file name is shortened to make room for it. */
const unique = (id: string): string => {
  let out = id, n = 2;
  while (taken.has(out.toLowerCase())) { const parts = id.split("/"); const last = parts.pop()!; const tag = ` (${n++})`; out = [...parts, last.slice(0, 80 - tag.length).trim() + tag].join("/"); }
  taken.add(out.toLowerCase()); return out;
};

function walk(dir: string, rel: string[]) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;                       // .obsidian, .trash, .git
    const full = join(dir, e.name);
    if (lstatSync(full).isSymbolicLink()) { skipped.push({ path: [...rel, e.name].join("/"), why: "symlink" }); continue; }
    if (e.isDirectory()) { if (rel.length + 1 >= MAX_DEPTH) skipped.push({ path: [...rel, e.name].join("/"), why: "too deep" }); else walk(full, [...rel, e.name]); continue; }
    if (!e.name.toLowerCase().endsWith(".md")) continue;
    const stem = e.name.slice(0, -3), orig = [...rel, stem].join("/");
    const size = lstatSync(full).size;
    if (size > MAX) { skipped.push({ path: orig, why: "over 1 MB" }); continue; }
    if (items.length >= MAX_NOTES) { skipped.push({ path: orig, why: "more than 5000 notes" }); continue; }
    const id = unique([...rel, stem].map(cleanSegment).join("/"));
    items.push({ from: full, id, changed: id !== orig });
  }
}
walk(src, []);

let written = 0, same = 0, renamed = 0;
for (const it of items) {
  const target = join(dest, ...it.id.split("/")) + ".md";
  const body = readFileSync(it.from);
  if (existsSync(target)) { if (readFileSync(target).equals(body)) { same++; continue; } renamed++; it.id = unique(it.id + " (imported)"); }
  const out = join(dest, ...it.id.split("/")) + ".md";
  if (apply) { mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, body, { flag: "wx" }); const m = lstatSync(it.from).mtime; utimesSync(out, m, m); }
  written++;
}
const changedNames = items.filter((i) => i.changed).map((i) => ({ id: i.id, from: i.from.slice(src.length + 1) }));
const report = { at: new Date().toISOString(), apply, found: items.length, written, alreadyThere: same, renamedBecauseDifferent: renamed, namesChanged: changedNames.length, skipped };
if (apply) { mkdirSync(data, { recursive: true }); writeFileSync(join(data, "import-report.json"), JSON.stringify({ ...report, changedNames }, null, 1)); }
console.log(`${apply ? "IMPORTED" : "DRY RUN"}: ${items.length} notes found, ${written} ${apply ? "written" : "would be written"}, ${same} already there, ${changedNames.length} names adjusted, ${skipped.length} skipped`);
for (const s of skipped.slice(0, 8)) console.log(`  skipped ${s.path}: ${s.why}`);
if (!apply) console.log("add --apply to write; nothing is changed without it");
