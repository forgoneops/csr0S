// The crew roster: the owner's own overrides on top of the Hermes profiles, kept in one small file in the data
// folder. A display name, a role line, and a retired flag. Nothing in a Hermes profile is touched: retiring only
// takes a member off the roster (it can be restored), renaming only changes what CAESAR shows.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type Roster = { names: Record<string, string>; roles: Record<string, string>; retired: string[] };
const FILE = () => join(process.env.CAESAROS_DATA ?? ".", "crew-roster.json");
export const ID_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;

/** One short line of plain text: control characters and angle brackets out, trimmed, at most `max` long. */
export const cleanLine = (v: unknown, max = 40): string => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "");

export function readRoster(): Roster {
  try {
    const j = JSON.parse(readFileSync(FILE(), "utf8"));
    const rec = (o: unknown): Record<string, string> => Object.fromEntries(Object.entries(o && typeof o === "object" ? o : {}).filter(([k, v]) => ID_RE.test(k) && typeof v === "string" && v).map(([k, v]) => [k, cleanLine(v)]));
    return { names: rec(j.names), roles: rec(j.roles), retired: Array.isArray(j.retired) ? j.retired.filter((x: unknown): x is string => typeof x === "string" && ID_RE.test(x)) : [] };
  } catch { return { names: {}, roles: {}, retired: [] }; }
}

export function writeRoster(r: Roster): void {
  const f = FILE(); if (!existsSync(dirname(f))) mkdirSync(dirname(f), { recursive: true });
  const tmp = `${f}.tmp`; writeFileSync(tmp, JSON.stringify(r)); renameSync(tmp, f);
}

/** One change to the roster, pure: rename (empty name resets), set a role line, retire or restore. */
export function change(r: Roster, id: string, op: { name?: string; role?: string; retire?: boolean }): Roster {
  const names = { ...r.names }, roles = { ...r.roles };
  if (op.name !== undefined) { const n = cleanLine(op.name); if (n) names[id] = n; else delete names[id]; }
  if (op.role !== undefined) { const n = cleanLine(op.role, 60); if (n) roles[id] = n; else delete roles[id]; }
  const retired = op.retire === undefined ? r.retired : op.retire ? [...new Set([...r.retired, id])] : r.retired.filter((x) => x !== id);
  return { names, roles, retired };
}
