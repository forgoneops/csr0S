// Where the app's own files live (web, packs, locales, plugins). From source it is the repository; an installed app sets
// CAESAROS_ROOT to its resource folder, because a compiled core has no source tree to read from. A compiled core started
// by hand (no CAESAROS_ROOT) finds the `resources` folder next to its own executable.
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

/** The app root for a given environment, module directory and executable path (pure, so a test can exercise it). */
export function resolveRoot(env: string | undefined, moduleDir: string, exe: string, exists: (p: string) => boolean = existsSync): string {
  if (env) return env;
  if (moduleDir.startsWith("/$bunfs") || moduleDir.startsWith("B:/~BUN")) {   // a `bun build --compile` binary has no source tree
    const beside = join(dirname(exe), "resources");
    if (exists(beside)) return beside;
  }
  return join(moduleDir, "..");
}

export const ROOT = resolveRoot(process.env.CAESAROS_ROOT, import.meta.dir, process.execPath);
