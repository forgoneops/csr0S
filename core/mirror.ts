// Mirror: what each Hermes profile keeps for itself, read only and without its contents: the size and age of its memory
// and user notes and how many skills it carries. The text of a memory is private to that profile and never read out here.
import type { Context, Hono } from "hono";
import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { listCrew } from "./crew";
import { memoFor } from "./memo";

export type MirrorRow = { id: string; name: string; memoryBytes: number; memoryAt: number | null; userBytes: number; skills: number };
const HOME = () => process.env.HERMES_HOME ?? join(homedir(), ".hermes");
const size = (p: string) => { try { const s = statSync(p); return s.isFile() ? { bytes: s.size, at: Math.round(s.mtimeMs) } : { bytes: 0, at: null }; } catch { return { bytes: 0, at: null as number | null }; } };

function countSkills(dir: string, depth = 0): number {
  if (!existsSync(dir) || depth > 4) return 0;
  let n = 0;
  try { for (const e of readdirSync(dir, { withFileTypes: true })) { if (e.isDirectory()) n += countSkills(join(dir, e.name), depth + 1); else if (e.name === "SKILL.md") n++; } } catch { /* unreadable: counted as none */ }
  return n;
}

export function mirror(): MirrorRow[] {
  return listCrew().map((m) => {
    const dir = join(HOME(), "profiles", m.id), mem = size(join(dir, "memories", "MEMORY.md")), user = size(join(dir, "memories", "USER.md"));
    return { id: m.id, name: m.name, memoryBytes: mem.bytes, memoryAt: mem.at, userBytes: user.bytes, skills: countSkills(join(dir, "skills")) };
  });
}

/** Run a read-only Hermes command and return its text; empty when Hermes is missing or slow. */
async function hermes(args: string[]): Promise<string> {
  const bin = Bun.which("hermes") ?? join(homedir(), ".local", "bin", "hermes");
  if (!existsSync(bin)) return "";
  try { const p = Bun.spawn([bin, ...args], { stdin: "ignore", stdout: "pipe", stderr: "ignore" }); const t = setTimeout(() => p.kill(), 15_000); const out = await new Response(p.stdout as ReadableStream).text(); clearTimeout(t); return out; } catch { return ""; }
}

export type KanbanTask = { id: string; title: string; status: string; assignee: string | null; at: number | null };
/** The Hermes kanban board as titles and states only (task bodies and results stay in Hermes). */
export function parseKanban(json: string): KanbanTask[] {
  try { const l = JSON.parse(json); return Array.isArray(l) ? l.filter((t) => t && typeof t.id === "string").map((t) => ({ id: t.id, title: String(t.title ?? "").slice(0, 200), status: String(t.status ?? ""), assignee: typeof t.assignee === "string" ? t.assignee : null, at: typeof t.created_at === "number" ? t.created_at : null })) : []; } catch { return []; }
}
/** The curator status as key facts: the lines Hermes prints, without paths. */
export function parseCurator(text: string): { enabled: boolean; lines: string[] } {
  const lines = text.split("\n").map((x) => x.trim()).filter((x) => x && !/\/home\/|last report/.test(x));
  return { enabled: /curator:\s*ENABLED/.test(text), lines };
}
const kanban = memoFor(10_000, async () => parseKanban(await hermes(["kanban", "list", "--json"])));
const curator = memoFor(10_000, async () => parseCurator(await hermes(["curator", "status"])));

export const mirrorApi = (app: Hono, isOperator: (c: Context) => boolean) => app.get("/api/mirror", (c) => (isOperator(c) ? c.json(mirror()) : c.json({ error: "operator_only" }, 403)));
export const mirrorMoreApi = (app: Hono, isOperator: (c: Context) => boolean) => {
  app.get("/api/mirror/kanban", async (c) => (isOperator(c) ? c.json(await kanban()) : c.json({ error: "operator_only" }, 403)));
  app.get("/api/mirror/curator", async (c) => (isOperator(c) ? c.json(await curator()) : c.json({ error: "operator_only" }, 403)));
};
