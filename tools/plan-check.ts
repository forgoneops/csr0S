// Checks docs/plan/BUILD-REGISTER-*.md: every requirement has a known step, an acceptance test and a valid status;
// every step has at least one requirement; "done" needs evidence. Usage: bun tools/plan-check.ts [register.md]
import { readFileSync, readdirSync } from "node:fs";
const dir = "docs/plan";
const file = process.argv[2] ?? `${dir}/${readdirSync(dir).filter((f) => f.startsWith("BUILD-REGISTER-")).sort().pop()}`;
const rows = (section: string) => {
  const part = readFileSync(file, "utf8").split(/^## /m).find((s) => s.startsWith(section)) ?? "";
  return part.split("\n").filter((l) => l.startsWith("|")).slice(2).map((l) => l.split("|").slice(1, -1).map((c) => c.trim()));
};
const STATUS = ["open", "doing", "blocked", "done", "dropped"];
const steps = new Set(rows("Steps").map((r) => r[0]));
const reqs = rows("Requirements");
const errors: string[] = [], used = new Set<string>(), count: Record<string, number> = {};
for (const [id, text, source, step, accept, status, evidence] of reqs) {
  count[status] = (count[status] ?? 0) + 1;
  if (!text || !source) errors.push(`${id}: missing text or source`);
  if (!accept) errors.push(`${id}: no acceptance test`);
  if (!STATUS.includes(status)) errors.push(`${id}: bad status "${status}"`);
  if (status === "done" && !evidence) errors.push(`${id}: done without evidence`);
  const list = (step ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!list.length) errors.push(`${id}: no step`);
  for (const s of list) { used.add(s); if (!steps.has(s)) errors.push(`${id}: unknown step ${s}`); }
}
for (const s of steps) if (!used.has(s)) errors.push(`step ${s}: no requirement points at it`);
console.log(`${file}: ${reqs.length} requirements, ${steps.size} steps, status ${JSON.stringify(count)}`);
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log("plan-check: ok");
