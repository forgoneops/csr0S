// A Claude Code account is a login kept in its own configuration folder (CLAUDE_CONFIG_DIR). Added by hand in Settings: no installer
// can see a second account. Standard library only.
import { existsSync, lstatSync, mkdirSync, realpathSync, symlinkSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

/** What the accounts share, so a session started on one can be resumed on the other and both behave the same. The login itself (credentials, history) is never shared. */
export const SHARED = ["skills", "CLAUDE.md", "settings.json", "plugins", "themes", "projects"] as const;

/** A folder for a new account: absolute, inside the operator's home, not the main account's own folder, not already used. Created if missing. */
export function validateConfigDir(dir: string, home: string, taken: string[]): string {
  const raw = String(dir ?? "").trim();
  if (!raw || !isAbsolute(raw)) throw new Error("Give the full path of the folder, for example your home folder followed by .claude-b.");
  const full = resolve(raw), rel = relative(home, full);
  if (rel.startsWith("..") || isAbsolute(rel) || rel === "") throw new Error("The folder must be inside your home folder.");
  if (/[\0\n]/.test(full)) throw new Error("That path is not valid.");
  const norm = (p: string) => { try { return realpathSync(p); } catch { return resolve(p); } };
  if (taken.some((t) => norm(t) === norm(full))) throw new Error("That folder is already used by another account.");
  if (existsSync(full) && !lstatSync(full).isDirectory()) throw new Error("That path exists and is not a folder.");
  mkdirSync(full, { recursive: true });
  return full;
}

/** Links what the accounts share from the main account's folder into the new one. Never replaces anything that is already there. */
export function prepareConfigDir(main: string, target: string): { linked: string[]; kept: string[]; missing: string[] } {
  const linked: string[] = [], kept: string[] = [], missing: string[] = [];
  mkdirSync(target, { recursive: true });
  for (const name of SHARED) {
    const from = join(main, name), to = join(target, name);
    if (!existsSync(from)) { missing.push(name); continue; }
    let present = false; try { lstatSync(to); present = true; } catch { /* not there */ }
    if (present) { kept.push(name); continue; }
    symlinkSync(from, to); linked.push(name);
  }
  return { linked, kept, missing };
}
