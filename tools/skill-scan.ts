#!/usr/bin/env bun
// Install-gate scan (plan 8.6c): read a skill, MCP or plugin folder without running it and report what it could do.
// Usage: bun tools/skill-scan.ts <dir>     Exit 0 green, 1 yellow, 2 red.
import { scanTree } from "../core/skillscan";

const dir = process.argv[2];
if (!dir) {
  console.error("usage: bun tools/skill-scan.ts <dir>");
  process.exit(2);
}
const s = scanTree(dir);
for (const f of s.findings) console.log(`${f.file}:${f.line}  ${f.rule} (${f.severity})  ${f.excerpt}`);
if (s.sha256) console.log(`sha256 ${s.sha256}`);
else console.log("sha256 unavailable: the tree was not fully scanned");
console.log(`${s.verdict}  ${s.findings.length} findings, ${s.files} files, ${s.bytes} bytes`);
process.exit(s.verdict === "red" ? 2 : s.verdict === "yellow" ? 1 : 0);
