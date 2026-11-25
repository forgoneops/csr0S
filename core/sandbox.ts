// Real isolation for agent turns. An agent that has a shell runs as the same system user as the app, so
// an API gate cannot stop it reading the database with its own hands. Here each agent turn can run
// inside a bubblewrap view of the filesystem in which the private places are not there: the database
// (tokens, settings) and the backups. Everything else looks as before.
// If bubblewrap is missing or cannot start (no user namespaces), turns run without it and the status
// says so: never a silent pass.
import { existsSync, realpathSync } from "node:fs";
import { join } from "node:path";

export type Hidden = { dirs: string[]; files: string[] };
export type Isolation = { enabled: boolean; available: boolean; active: boolean; hidden: string[]; note: string };

/** The places no agent may see from inside a turn. Real paths, so a symlinked data folder is covered too. */
export function hiddenPlaces(data: string): Hidden {
  const real = (p: string) => { try { return realpathSync(p); } catch { return p; } };
  const dirs = ["backups", "secrets"].map((x) => real(join(data, x))).filter((p) => existsSync(p));
  const files = ["caesaros.db", "caesaros.db-wal", "caesaros.db-shm"].map((x) => join(real(data), x)).filter((p) => existsSync(p));
  return { dirs, files };
}

/** The command line with the isolation put in front of it. Pure: the same inputs give the same argv. */
export function isolatedArgv(argv: string[], hidden: Hidden, bwrap = "bwrap"): string[] {
  return [bwrap, "--die-with-parent", "--new-session", "--unshare-pid", "--unshare-ipc",
    "--bind", "/", "/", "--dev-bind", "/dev", "/dev", "--proc", "/proc",
    ...hidden.dirs.flatMap((d) => ["--tmpfs", d]),
    ...hidden.files.flatMap((f) => ["--ro-bind", "/dev/null", f]),
    "--", ...argv];
}

let probed: boolean | null = null;
/** Can bubblewrap start a process here? Checked once, by really starting `true` inside it. */
export function bwrapWorks(bwrap = Bun.which("bwrap")): boolean {
  if (!bwrap) return false;
  if (probed !== null) return probed;
  try { probed = Bun.spawnSync(isolatedArgv(["true"], { dirs: [], files: [] }, bwrap), { stdout: "ignore", stderr: "ignore", timeout: 5000 }).exitCode === 0; } catch { probed = false; }
  return probed;
}

/** What a turn of an agent should run: the isolated command when isolation is on and works, else the command itself. */
export function forAgentTurn(argv: string[], data: string, enabled: boolean): string[] {
  if (!enabled || !bwrapWorks()) return argv;
  return isolatedArgv(argv, hiddenPlaces(data), Bun.which("bwrap") ?? "bwrap");
}

export function isolationStatus(data: string, enabled: boolean): Isolation {
  const available = bwrapWorks(), h = hiddenPlaces(data), active = enabled && available;
  const note = !available ? "bubblewrap is not available here (install it: bwrap), so agent turns run without isolation."
    : !enabled ? "Isolation is switched off: an agent with a shell can read the database and the backups."
    : "Each agent turn runs in a view of the system where the database and the backups are not there.";
  return { enabled, available, active, hidden: [...h.dirs, ...h.files], note };
}
