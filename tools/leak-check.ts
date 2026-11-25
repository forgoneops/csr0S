#!/usr/bin/env bun
// Leak check: the clean repo must hold code and docs only, never a person's data. Scans every tracked file for things that
// identify one person or one machine: email addresses, home-directory paths, secret-shaped strings, tailnet addresses and
// the owner's own names. Run it before every commit to the clean repo (tools/install-hooks.sh makes git do it for you).
// Usage: bun tools/leak-check.ts [--list]     Exit 1 when something leaks.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const OWNER = (process.env.LEAK_OWNER_WORDS ?? "bartman,konrad bartman,forgoneops,kbat").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
const RULES: [string, RegExp][] = [
  // `\d+x\.` skips icon file names such as `128x128@2x.png`, which read like an address but are not one.
  ["email address", /[A-Za-z0-9._%+-]+@(?!example\.|users\.noreply\.github\.com|noreply\.|\d+x\.)[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g],
  ["home path", /\/home\/[a-z][a-z0-9_-]+\//g],
  // `(?!\/\d)` skips a written range such as `100.64.0.0/10`; that names a network, not someone's machine.
  ["tailnet or private address", /\b(?:100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3})\b(?!\/\d)/g],
  ["secret-shaped string", /\b(?:sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}|xox[abp]-[A-Za-z0-9-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/g],
];
// What the clean repo never carries at all, by path: personal data, study material, the private owner layer.
const FORBIDDEN_PATHS = [/^data\//, /^owner\//, /^docs\/reference\//, /^docs\/handoff\//, /\.(db|sqlite|key|pem|env)$/i, /(^|\/)\.env/];
// `owner/.gitkeep` is the empty placeholder that keeps the private layer's folder in git; it holds no data.
const ALLOWED_PATHS = [/^owner\/\.gitkeep$/];
// The scanner has to name the words it searches for, so its own word list is not a leak.
const SELF = "tools/leak-check.ts";
// The owner chose to sign the project publicly: the copyright line in LICENSE and the author line in package.json are the only places a name and an address may appear.
const AUTHOR_LINES: Record<string, RegExp> = { LICENSE: /^Copyright .*$/m, "package.json": /^\s*"author":.*$/m, "README.md": /^> \*"Written by Varro.*$/m };
const BINARY = /\.(png|jpe?g|webp|gif|woff2?|ttf|otf|ico|svg|mp4|wav|mp3|zip|gz|wasm)$/i;

const files = spawnSync("git", ["ls-files"], { encoding: "utf8" }).stdout.split("\n").filter(Boolean);
const hits: { file: string; rule: string; sample: string }[] = [];
for (const f of files) {
  for (const p of FORBIDDEN_PATHS) if (p.test(f) && !ALLOWED_PATHS.some((a) => a.test(f))) hits.push({ file: f, rule: "forbidden path", sample: "" });
  if (BINARY.test(f)) continue;
  let text: string; try { text = readFileSync(f, "utf8"); } catch { continue; }
  if (text.length > 2_000_000) continue;
  if (AUTHOR_LINES[f]) text = text.replace(AUTHOR_LINES[f], "");
  for (const [rule, re] of RULES) { re.lastIndex = 0; const m = re.exec(text); if (m) hits.push({ file: f, rule, sample: m[0].slice(0, 60) }); }
  const low = text.toLowerCase();
  if (f !== SELF) for (const w of OWNER) if (low.includes(w)) { hits.push({ file: f, rule: "owner name", sample: w }); break; }
}
const byRule = new Map<string, number>(); for (const h of hits) byRule.set(h.rule, (byRule.get(h.rule) ?? 0) + 1);
if (process.argv.includes("--list")) for (const h of hits) console.log(`${h.rule.padEnd(26)} ${h.file}  ${h.sample}`);
console.log(`${files.length} files scanned, ${hits.length} leaks`, Object.fromEntries(byRule));
process.exit(hits.length ? 1 : 0);
