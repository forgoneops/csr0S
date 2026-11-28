// What outside services cost, per day: calls, units (Jev: input tokens, Fish: UTF-8 bytes of text) and dollars. One small JSON file per service in data/usage; read by Rations.
// Jev's dollars are what the service reports; Fish's are an ESTIMATE from FISH_USD_PER_MB (editable here), never a bill.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type Day = { calls: number; units: number; usd: number };
export const FISH_USD_PER_MB = 15; // Fish bills text by bytes; this is an estimate to be checked against the dashboard
const file = (root: string, s: string) => join(root, "usage", `${s.replace(/[^\w-]/g, "")}.json`);
const today = () => new Date().toISOString().slice(0, 10);

export function readUsage(root: string, service: string): Record<string, Day> {
  try { return existsSync(file(root, service)) ? JSON.parse(readFileSync(file(root, service), "utf8")) : {}; } catch { return {}; }
}
export function recordUsage(root: string, service: string, add: { units?: number; usd?: number }, day = today()) {
  const all = readUsage(root, service), d = all[day] ?? { calls: 0, units: 0, usd: 0 };
  all[day] = { calls: d.calls + 1, units: d.units + (add.units ?? 0), usd: d.usd + (add.usd ?? 0) };
  for (const k of Object.keys(all).sort().slice(0, -400)) delete all[k]; // about 13 months
  mkdirSync(join(root, "usage"), { recursive: true });
  const tmp = `${file(root, service)}.tmp`; writeFileSync(tmp, JSON.stringify(all)); renameSync(tmp, file(root, service));
}
export const spentToday = (root: string, service: string) => readUsage(root, service)[today()]?.usd ?? 0;
export const fishUsd = (textBytes: number) => (textBytes / 1_000_000) * FISH_USD_PER_MB;
