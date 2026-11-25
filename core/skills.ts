// Skills on this computer (the Marketplace's read side): every SKILL.md under a folder, with its own name and
// description, and a plain static scan of what the file asks an agent to do. The scan is a list of things worth
// a second look, not a verdict. Nothing is installed, copied or run from here.
import type { Context, Hono } from "hono";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative } from "node:path";

export type Skill = { id: string; name: string; description: string; category: string; flags: string[] };
const FLAGS: [string, RegExp][] = [
  ["runs as an administrator (sudo)", /\bsudo\b/],
  ["deletes files (rm -rf)", /\brm\s+-[a-z]*r[a-z]*f?\b/],
  ["downloads and runs code (curl or wget piped to a shell)", /\b(curl|wget)\b[^\n|]*\|\s*(ba)?sh\b/],
  ["installs packages", /\b(pip3?|npm|bun|cargo|gem)\s+(install|add)\b/],
  ["uses ssh or scp", /\b(ssh|scp)\s+\S/],
  ["opens a network address", /https?:\/\/(?!localhost|127\.0\.0\.1)[a-z0-9.-]+/i],
  ["reads secrets or keys", /(api[_-]?key|secret|token|password)\s*[=:]/i],
];
const MAX_FILES = 600, MAX_BYTES = 200_000;

/** Folders to scan, in order: CAESAROS_SKILLS_DIR may hold several separated by ":" (a skill found earlier wins). */
export const skillsDirs = (): string[] => (process.env.CAESAROS_SKILLS_DIR ?? join(homedir(), ".hermes", "skills")).split(":").filter((d) => d && existsSync(d));
export const skillsDir = (): string | null => skillsDirs()[0] ?? null;

/** The first `key: value` of a YAML-ish header; quotes are dropped. */
const field = (head: string, key: string) => { const m = new RegExp(`^${key}:\\s*(.+)$`, "m").exec(head); return m ? m[1]!.trim().replace(/^["']|["']$/g, "") : ""; };

export function scanSkills(dirs: string | string[] | null = skillsDirs()): Skill[] {
  const list = (Array.isArray(dirs) ? dirs : dirs ? [dirs] : []).filter(Boolean);
  const seen = new Set<string>(), out: Skill[] = [];
  for (const dir of list) scanOne(dir, out, seen);
  return out.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}

function scanOne(dir: string, out: Skill[], seen: Set<string>): void {
  const walk = (d: string, depth: number) => {
    if (out.length >= MAX_FILES || depth > 4) return;
    let names: string[] = []; try { names = readdirSync(d); } catch { return; }
    for (const n of names) {
      const p = join(d, n);
      let st; try { st = statSync(p); } catch { continue; }
      if (st.isDirectory()) walk(p, depth + 1);
      else if (n === "SKILL.md" && st.size <= MAX_BYTES) {
        const text = readFileSync(p, "utf8"), head = /^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? "";
        const rel = relative(dir, d), id = rel || n;
        if (seen.has(id)) continue; seen.add(id);
        out.push({ id, name: field(head, "name") || id.split("/").pop()!, description: field(head, "description").slice(0, 300), category: rel.split("/")[0] || "general", flags: FLAGS.filter(([, re]) => re.test(text)).map(([l]) => l) });
      }
    }
  };
  walk(dir, 0);
}

export function skillsApi(app: Hono, isOperator: (c: Context) => boolean) {
  app.get("/api/skills", (c) => (isOperator(c) ? c.json(scanSkills()) : c.json({ error: "operator_only" }, 403)));
}
