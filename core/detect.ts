// First-run detection (R47): what this machine actually has. PATH walk, the tool's own
// read-only version command, and nothing else. No shell, no secret, no owner default, no
// network call. `bun core/detect.ts --check` prints the same answer and writes nothing.
import { accessSync, constants, statSync } from "node:fs";
import { delimiter, isAbsolute, join } from "node:path";

export type Probe = {
  ran: boolean;          // the command was started
  ok: boolean;           // it exited 0
  version: string | null; // first version-looking line, trimmed
  error: string | null;  // "not found", "timeout", "exit 1: …"
};

export type Engine = {
  id: string;
  label: string;
  command: string;   // the binary name to look for on PATH
  probe: string[];   // the tool's own read-only command, argv only, never a shell
  signIn: string;    // what the person runs themselves; shown, never executed
};

export type EngineReport = {
  id: string;
  label: string;
  found: boolean;
  path: string | null;
  probe: Probe;
  signIn: string | null; // only when found but not answering
};

export type Detection = {
  engines: EngineReport[];
  answering: number; // tools whose own probe answered; says nothing about chat, see /api/detect modelSources
  brain: { location: "local" | "remote"; url: string };
};

/** The allowlist. A probe is a constant here, never built from input, and never run through a shell. */
export const ENGINES: Engine[] = [
  { id: "hermes", label: "Hermes", command: "hermes", probe: ["hermes", "--version"], signIn: "hermes model" },
  { id: "claude", label: "Claude Code", command: "claude", probe: ["claude", "--version"], signIn: "claude" },
  { id: "codex", label: "Codex", command: "codex", probe: ["codex", "--version"], signIn: "codex login" },
  { id: "gemini", label: "Gemini CLI", command: "gemini", probe: ["gemini", "--version"], signIn: "gemini" },
  { id: "ollama", label: "Ollama", command: "ollama", probe: ["ollama", "--version"], signIn: "ollama serve" },
];

const WIN = process.platform === "win32";

/** PATH split in order, empty and relative entries dropped, de-duplicated. A missing PATH is no dirs. */
export function walkPath(pathValue: string | undefined = process.env.PATH, sep: string = delimiter): string[] {
  if (!pathValue) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of pathValue.split(sep)) {
    const dir = raw.trim();
    if (!dir || !(dir.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(dir) || dir.startsWith("\\\\"))) continue;
    if (seen.has(dir)) continue;
    seen.add(dir);
    out.push(dir);
  }
  return out;
}

/** The first executable file named `name` in `dirs`, in order. Unreadable directories are skipped. */
export function findExecutable(name: string, dirs: string[]): string | null {
  const candidates = WIN ? [name, `${name}.exe`, `${name}.cmd`, `${name}.ps1`] : [name];
  for (const dir of dirs) {
    for (const candidate of candidates) {
      const file = join(dir, candidate);
      try {
        if (!statSync(file).isFile()) continue;
        accessSync(file, constants.X_OK);
        return file;
      } catch {
        // not there, not a file, or not executable: next candidate
      }
    }
  }
  return null;
}

const VERSION = /\d+\.\d+/;

export type ProbeRunResult = { code: number | null; out: string; err: string; timedOut: boolean };

/** How a probe process is started. Injected in tests so no real process runs. May answer sync or async. */
export type ProbeRun = (argv: string[], timeoutMs: number) => ProbeRunResult | Promise<ProbeRunResult>;

/**
 * Runs one probe argv directly (no shell) with a short timeout. In tests `run` is injected.
 * argv[0] must be the absolute path the PATH walk found: a bare name would let the process PATH
 * (a planted binary in cwd or a relative entry) choose what runs. Async so the server loop stays free.
 */
export async function runProbe(argv: string[], opts: { timeoutMs?: number; run?: ProbeRun } = {}): Promise<Probe> {
  const timeoutMs = opts.timeoutMs ?? 2000;
  const run = opts.run ?? defaultRun;
  if (argv.length === 0) return { ran: false, ok: false, version: null, error: "empty command" };
  if (!opts.run && !isAbsolute(argv[0])) {
    return { ran: false, ok: false, version: null, error: "probe path is not absolute" };
  }
  let result: ProbeRunResult;
  try {
    result = await run(argv, timeoutMs);
  } catch (e) {
    return { ran: false, ok: false, version: null, error: (e as Error).message };
  }
  if (result.timedOut) return { ran: true, ok: false, version: null, error: "timeout" };
  const text = `${result.out}\n${result.err}`.trim();
  const line = text.split("\n").map((l) => l.trim()).find((l) => VERSION.test(l)) ?? null;
  const version = line ? line.slice(0, 80) : null;
  if (result.code === 0) return { ran: true, ok: true, version, error: null };
  const reason = text.split("\n")[0]?.trim().slice(0, 120) || "no output";
  return { ran: true, ok: false, version, error: `exit ${result.code ?? "?"}: ${reason}` };
}

/** Bun.spawn, never Bun.spawnSync: a probe must not block the server loop. Same timeout, then SIGKILL. */
async function defaultRun(argv: string[], timeoutMs: number): Promise<ProbeRunResult> {
  const p = Bun.spawn(argv, { stdout: "pipe", stderr: "pipe", stdin: "ignore" });
  const collected = (async () => {
    const [code, out, err] = await Promise.all([p.exited, new Response(p.stdout).text(), new Response(p.stderr).text()]);
    return { code, out, err, timedOut: false };
  })();
  collected.catch(() => {}); // the child may die after the timeout; that rejection is not ours to throw
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<ProbeRunResult>((resolve) => {
    timer = setTimeout(() => {
      p.kill();
      resolve({ code: null, out: "", err: "", timedOut: true });
    }, timeoutMs);
  });
  try {
    return await Promise.race([collected, timedOut]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Detect the allowlisted engines. `dirs` and `run` are injected so tests never touch the real machine.
 * Every probe runs at once, and each runs the absolute path the walk found: the process PATH never
 * decides which binary answers.
 */
export async function detectEngines(
  opts: { dirs?: string[]; timeoutMs?: number; run?: ProbeRun; engines?: Engine[] } = {},
): Promise<EngineReport[]> {
  const dirs = opts.dirs ?? walkPath();
  const engines = opts.engines ?? ENGINES;
  return Promise.all(engines.map(async (engine) => {
    const path = findExecutable(engine.command, dirs);
    const probe: Probe = path
      ? await runProbe([path, ...engine.probe.slice(1)], { timeoutMs: opts.timeoutMs, run: opts.run })
      : { ran: false, ok: false, version: null, error: "not found" };
    return {
      id: engine.id,
      label: engine.label,
      found: path !== null,
      path,
      probe,
      signIn: path && !probe.ok ? engine.signIn : null,
    };
  }));
}

/** Exactly the engines that exist. Absence is silent: an engine that is not installed is not offered. */
export const offerable = (detection: Detection): EngineReport[] => detection.engines.filter((e) => e.found);

/** The whole first-run answer. Writes nothing, calls nothing outward. */
export type DetectOptions = {
  dirs?: string[];
  timeoutMs?: number;
  run?: ProbeRun;
  engines?: Engine[];
  brain?: { location?: "local" | "remote"; url?: string };
};

export async function detect(opts: DetectOptions = {}): Promise<Detection> {
  const engines = await detectEngines(opts);
  return {
    engines,
    answering: engines.filter((e) => e.probe.ok).length,
    brain: { location: opts.brain?.location ?? "local", url: opts.brain?.url ?? "" },
  };
}

/** A clean-machine answer carries no host, account, URL or token: asserted by test. */
export const NO_OWNER_FIELDS = ["host", "account", "token", "url"] as const;

if (import.meta.main) {
  const args = process.argv.slice(2);
  const known = new Set(["--check", "--json", "--help", "-h"]);
  const unknown = args.filter((a) => a.startsWith("-") && !known.has(a) && a !== "--timeout");
  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write("Usage: bun core/detect.ts [--check] [--json] [--timeout <ms>]\n\nPrints what this machine has. Writes nothing.\n");
    process.exit(0);
  }
  if (unknown.length) {
    process.stderr.write(`detect: unknown flag ${unknown[0]}\n`);
    process.exit(2);
  }
  const timeoutMs = (() => {
    const at = args.indexOf("--timeout");
    if (at < 0) return 2000;
    const n = Number(args[at + 1]);
    if (!Number.isFinite(n) || n <= 0) {
      process.stderr.write("detect: --timeout needs a positive number of milliseconds\n");
      process.exit(2);
    }
    return n;
  })();
  try {
    const result = await detect({ timeoutMs });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (e) {
    process.stderr.write(`detect failed: ${(e as Error).message}\n`);
    process.exit(2);
  }
}
