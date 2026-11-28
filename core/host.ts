// What the core may learn about this computer by itself (skills, Hermes profiles, hardware, names, addresses).
// Normally: everything, because finding the person's own agents is the point. A THROWAWAY copy finds nothing: one whose
// CAESAROS_DATA is inside the system's temp area (tests, demos, screenshots), where nobody keeps real work. Every shipped
// launcher sets CAESAROS_DATA too, so "set" or "empty" cannot be the sign. CAESAROS_ISOLATED=1 or 0 forces either way.
// An explicit override (HERMES_HOME, CAESAROS_SKILLS_DIR, ...) is the person pointing at something and always wins.
import { realpathSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";

const real = (p: string) => { try { return realpathSync(p); } catch { return resolve(p); } };
const inside = (root: string, p: string) => p === root || p.startsWith(root.endsWith(sep) ? root : root + sep);

export function isolated(env: Record<string, string | undefined> = process.env, home = homedir(), temp = tmpdir()): boolean {
  if (env.CAESAROS_ISOLATED === "1") return true;
  if (env.CAESAROS_ISOLATED === "0" || !env.CAESAROS_DATA) return false;
  const data = real(env.CAESAROS_DATA);
  if (inside(real(join(home, ".local", "share")), data)) return false;   // where every launcher keeps a real install
  // a TMPDIR that holds the whole home folder (TMPDIR=$HOME) says nothing about the folders inside that home
  const h = real(home), t = real(temp), wide = t === "/" || (inside(t, h) && inside(h, data));
  return ["/tmp", "/var/tmp", "/dev/shm", ...(wide ? [] : [t])].some((r) => inside(real(r), data));
}

/** The home folder discovery starts from. Under /dev/null nothing exists and nothing can be created. */
export const userHome = (): string => (isolated() ? "/dev/null/no-host" : homedir());
export const hermesHome = (): string => process.env.HERMES_HOME ?? join(userHome(), ".hermes");
/** The `hermes` command reads the person's own profiles, jobs and board, so a throwaway copy runs it only against a HERMES_HOME it was given. */
export const hermesAllowed = (): boolean => !isolated() || !!process.env.HERMES_HOME;
