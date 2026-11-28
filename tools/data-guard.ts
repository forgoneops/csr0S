#!/usr/bin/env bun
// Data guard: nothing from the person's own data directory may sit in a tracked file. Fails when a tracked file is
// byte-identical to a file in the data dir (a copied note, db or key), or when a tracked file contains the name of one
// of the person's notes (file stem of 12+ characters) unless that name is public vocabulary of the repo (part of a tracked path, listed in tools/data-guard-public.txt, or used in 3+ tracked files). Skips quietly when there is no data dir (CI, a fresh clone).
// Usage: bun tools/data-guard.ts        Exit 1 on a hit. Runs from the pre-push hook (tools/install-hooks.sh).
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { spawnSync } from "node:child_process";

const DATA = process.env.CAESAROS_DATA ?? join(process.env.HOME ?? "", ".local/share/caesaros");
if (!existsSync(DATA)) { console.log("data-guard: no data dir, nothing to compare"); process.exit(0); }
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const SKIP = new Set(["node_modules", ".git", "backups"]);
const hashes = new Set<string>(); const stems = new Set<string>();
const walk = (d: string, depth = 0) => {
  for (const n of readdirSync(d)) {
    if (SKIP.has(n)) continue;
    const p = join(d, n); const st = statSync(p);
    if (st.isDirectory()) { if (depth < 8) walk(p, depth + 1); continue; }
    if (st.size < 40 || st.size > 20_000_000) continue; // tiny files (empty configs) and huge ones say nothing
    hashes.add(sha(readFileSync(p)));
    const stem = basename(n, extname(n)).toLowerCase();
    if (extname(n) === ".md" && stem.length >= 12 && /[a-z]/.test(stem)) stems.add(stem);
  }
};
walk(DATA);
const files = spawnSync("git", ["ls-files", "-z"], { encoding: "utf8" }).stdout.split("\0").filter(Boolean);
const hits: string[] = [];
// A note name that is also public vocabulary of this repo says nothing about the person: it is a path segment of a tracked file
// (skills/caesar-board) or it appears in 3 or more tracked files. A name that shows up in one or two files is still a hit.
const segs = new Set(files.flatMap((f) => f.toLowerCase().split("/").map((x) => basename(x, extname(x)))));
const texts = new Map<string, string>();
for (const f of files) {
  let b: Buffer; try { b = readFileSync(f); } catch { continue; }
  if (b.length >= 40 && hashes.has(sha(b))) hits.push(`${f}: identical to a file in your data dir`);
  if (b.length > 2_000_000 || /\.(png|webp|jpe?g|gif|mp4|woff2?|ico|icns)$/i.test(f)) continue;
  texts.set(f, b.toString("utf8").toLowerCase());
}
const spread = new Map<string, number>();
for (const s of stems) { let n = 0; for (const t of texts.values()) if (t.includes(s)) n++; spread.set(s, n); }
const paths = files.join("\n").toLowerCase();
const PUBLIC = new Set(existsSync("tools/data-guard-public.txt") ? readFileSync("tools/data-guard-public.txt", "utf8").split("\n").map((l) => l.trim().toLowerCase()).filter((l) => l && !l.startsWith("#")) : []);
const personal = [...stems].filter((s) => !segs.has(s) && !paths.includes(s) && !PUBLIC.has(s) && (spread.get(s) ?? 0) < 3);
for (const [f, t] of texts) for (const s of personal) if (t.includes(s)) { hits.push(`${f}: names your note "${s}"`); break; }
if (hits.length) { console.error(hits.join("\n")); console.error(`data-guard: ${hits.length} hit(s). Your data must not enter the repo.`); process.exit(1); }
console.log(`data-guard: ${files.length} tracked files, none from your data dir`);
