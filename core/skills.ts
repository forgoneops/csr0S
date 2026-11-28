// Skills on this computer (the Marketplace's read side): every SKILL.md under a folder, with its own name and
// description, and a plain static scan of what the file asks an agent to do. The scan is a list of things worth
// a second look, not a verdict. Nothing is installed, copied or run from here.
import type { Context, Hono } from "hono";
import { existsSync, lstatSync, readdirSync, realpathSync } from "node:fs";
import { join, relative } from "node:path";
import { hermesHome } from "./host";
import { readRegularFileNoFollow } from "./safe-file";

export type Skill = { id: string; name: string; description: string; category: string; flags: string[]; agents: string[]; tags: string[]; enabled: boolean };
/** Which agent a skills folder belongs to, read from its path (shortcut: a path heuristic, upgrade when folders carry a label). */
export const agentOfDir = (dir: string): string =>
  /[\\/]\.hermes[\\/]/.test(dir) ? "Hermes" : /[\\/]\.claude[\\/]/.test(dir) ? "Claude Code" : /[\\/]\.agents[\\/]/.test(dir) ? "Codex" : /marketplace[\\/]installed/.test(dir) ? "Installed" : "CaesarOS";
/** Tags: the file's own `tags:` line wins; otherwise caesar-* skills are the pack, and owner-only / dev come from the name (shortcut: name heuristic). */
export function tagsOf(name: string, head: string): string[] {
  const own = field(head, "tags").replace(/^\[|\]$/g, "").split(/[,\s]+/).map((t) => t.replace(/^["']|["']$/g, "").toLowerCase()).filter(Boolean);
  if (own.length) return [...new Set(own)];
  const t: string[] = [];
  if (name.startsWith("caesar-")) t.push("pack");
  if (/(brain|vault|ledger|token|connectors|model-providers|mail|speech|vox|two-instances|public-copy|replace-saas|decision-log|goal)/.test(name)) t.push("owner-only");
  if (/(build|debug|tdd|spec|plan|review|verify|swift|web|ui-|motion|plugin|harden|spike|sweep|touch|qa|icons|codegraph|atrium|modules|isolation|premium|no-slop|install-tools|update|track-sync|method)/.test(name)) t.push("dev");
  return t;
}
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
export const skillsDirs = (): string[] => (process.env.CAESAROS_SKILLS_DIR ?? join(hermesHome(), "skills")).split(":").filter((d) => d && existsSync(d));
export const skillsDir = (): string | null => skillsDirs()[0] ?? null;

/** The first `key: value` of a YAML-ish header; quotes are dropped. */
export const field = (head: string, key: string) => { const m = new RegExp(`^${key}:\\s*(.+)$`, "m").exec(head); return m ? m[1]!.trim().replace(/^["']|["']$/g, "") : ""; };

export function scanSkills(dirs: string | string[] | null = skillsDirs()): Skill[] {
  const list = (Array.isArray(dirs) ? dirs : dirs ? [dirs] : []).filter(Boolean);
  const seen = new Set<string>(), out: Skill[] = [];
  for (const dir of list) scanOne(dir, out, seen);
  return out.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}

function scanOne(dir: string, out: Skill[], seen: Set<string>): void {
  let root: string; try { root = realpathSync(dir); } catch { return; }
  const walk = (d: string, depth: number) => {
    if (out.length >= MAX_FILES || depth > 4) return;
    let names: string[] = []; try { names = readdirSync(d); } catch { return; }
    for (const n of names) {
      const p = join(d, n);
      // The Marketplace is read-only, but a symlink inside a skill folder could still
      // make this listing read and expose a SKILL.md outside the selected folder.
      let st; try { st = lstatSync(p); } catch { continue; }
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) walk(p, depth + 1);
      else if (n === "SKILL.md" && st.size <= MAX_BYTES) {
        let text: string; try { text = readRegularFileNoFollow(p, st, root, MAX_BYTES).toString("utf8"); } catch { continue; }
        const head = /^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? "";
        const rel = relative(root, d), id = rel || n;   // against the realpath the walk uses: a linked skills folder would give "../.." ids
        const agent = agentOfDir(dir), name = field(head, "name") || id.split("/").pop()!;
        if (seen.has(id)) { const first = out.find((x) => x.id === id); if (first && !first.agents.includes(agent)) first.agents.push(agent); continue; }
        seen.add(id);
        out.push({ id, name, description: field(head, "description").slice(0, 300), category: rel.split("/")[0] || "general", flags: FLAGS.filter(([, re]) => re.test(text)).map(([l]) => l), agents: [agent], tags: tagsOf(name, head), enabled: !/^(false|no|off)$/i.test(field(head, "enabled")) });
      }
    }
  };
  walk(root, 0);
}

/** The text of one skill's SKILL.md (header removed), found by the same safe walk; null when it is not there. */
export function skillBody(id: string, dirs: string[]): string | null {
  if (!id || id.split("/").includes("..") || id.startsWith("/")) return null;
  for (const dir of dirs) {
    let root: string; try { root = realpathSync(dir); } catch { continue; }
    const p = join(root, id, "SKILL.md");
    try { const st = lstatSync(p); if (!st.isFile() || st.size > MAX_BYTES) continue; return readRegularFileNoFollow(p, st, root, MAX_BYTES).toString("utf8").replace(/^---\n[\s\S]*?\n---\n?/, ""); } catch { continue; }
  }
  return null;
}

export function skillsApi(app: Hono, isOperator: (c: Context) => boolean, extraDirs: string[] = []) {
  const dirs = () => [...extraDirs, ...skillsDirs()];
  app.get("/api/skills", (c) => (isOperator(c) ? c.json(scanSkills(dirs())) : c.json({ error: "operator_only" }, 403)));
  app.get("/api/skills/body", (c) => { if (!isOperator(c)) return c.json({ error: "operator_only" }, 403); const b = skillBody(c.req.query("id") ?? "", dirs()); return b === null ? c.json({ error: "not_found" }, 404) : c.json({ body: b }); });
}
