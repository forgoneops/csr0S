#!/usr/bin/env bun
// Seeds the shell's Polish catalog (web/atrium/locales/pl.json) from the reviewed English and Polish dictionaries of the first
// shell (web/src/i18n.ts). Only plain strings go in (no {name} placeholders), and a string that is the same in both languages is
// skipped. Existing entries in the seed are kept, so a hand edit of the file survives a re-run. Run: bun tools/i18n-seed.ts
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DICTS } from "../web/src/i18n";
import { keyOf } from "../core/i18n";

const file = join(import.meta.dir, "..", "web", "atrium", "locales", "pl.json");
const cur: Record<string, string> = JSON.parse(readFileSync(file, "utf8") || "{}");
let added = 0;
for (const [k, en] of Object.entries(DICTS.en)) {
  const pl = DICTS.pl[k]; const key = keyOf(en);
  if (!key || !pl || pl === en || /\{[a-z]/i.test(en) || /\{[a-z]/i.test(pl) || cur[key]) continue;
  cur[key] = pl; added++;
}
writeFileSync(file, JSON.stringify(Object.fromEntries(Object.entries(cur).sort(([a], [b]) => a.localeCompare(b))), null, 1) + "\n");
console.log(`seed: ${added} added, ${Object.keys(cur).length} in the catalog`);
