// Gate R47: first run detects by PATH walk and the tools' own commands, offers only what exists,
// shows the vendor sign-in command without running it, and carries no owner default.
import { describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, relative } from "node:path";
import {
  ENGINES,
  detect,
  detectEngines,
  findExecutable,
  offerable,
  runProbe,
  walkPath,
  type ProbeRun,
} from "../core/detect";

const temp = () => mkdtempSync(join(tmpdir(), "caesaros-detect-"));

/** A fake PATH directory holding an executable file with the given name. */
function binDir(name: string, content = "#!/bin/sh\necho 9.9.9\n"): string {
  const dir = temp();
  const file = join(dir, name);
  writeFileSync(file, content);
  chmodSync(file, 0o755);
  return dir;
}

describe("walkPath", () => {
  test("keeps order, drops empty and relative entries, de-duplicates", () => {
    expect(walkPath(`/a${delimiter}/b${delimiter}${delimiter}relative/bin${delimiter}/a`)).toEqual(["/a", "/b"]);
  });

  test("an empty PATH is no directories, not an error", () => {
    expect(walkPath("")).toEqual([]);
    expect(walkPath("", ":")).toEqual([]);
  });

  test("keeps an absolute Windows drive and a UNC path", () => {
    expect(walkPath(`C:\\bin;\\\\server\\share`, ";")).toEqual(["C:\\bin", "\\\\server\\share"]);
  });
});

describe("findExecutable", () => {
  test("finds the first executable in PATH order", () => {
    const first = binDir("claude");
    const second = binDir("claude");
    expect(findExecutable("claude", [first, second])).toBe(join(first, "claude"));
  });

  test("skips a file that is not executable and a directory", () => {
    const dir = temp();
    writeFileSync(join(dir, "codex"), "not executable");
    mkdirSync(join(dir, "hermes"));
    expect(findExecutable("codex", [dir])).toBe(null);
    expect(findExecutable("hermes", [dir])).toBe(null);
  });

  test("a directory that cannot be read is skipped, not fatal", () => {
    const real = binDir("ollama");
    expect(findExecutable("ollama", [join(temp(), "missing"), real])).toBe(join(real, "ollama"));
  });
});

describe("runProbe", () => {
  const run = (code: number | null, out = "", err = "", timedOut = false): ProbeRun => () => ({ code, out, err, timedOut });

  test("a version command that exits 0 is ok and its version is read", async () => {
    const p = await runProbe(["/bin/claude", "--version"], { run: run(0, "2.1.4 (Claude Code)\n") });
    expect({ ok: p.ok, version: p.version }).toEqual({ ok: true, version: "2.1.4 (Claude Code)" });
  });

  test("a non-zero exit is reported with the first line of output", async () => {
    const p = await runProbe(["/bin/codex", "--version"], { run: run(1, "", "not signed in\n") });
    expect(p.ok).toBe(false);
    expect(p.error).toBe("exit 1: not signed in");
  });

  test("a hung tool is a timeout, not a find", async () => {
    const p = await runProbe(["/bin/ollama", "--version"], { run: run(null, "", "", true) });
    expect({ ok: p.ok, error: p.error }).toEqual({ ok: false, error: "timeout" });
  });

  test("an empty command never starts a process", async () => {
    expect((await runProbe([], { run: run(0) })).error).toBe("empty command");
  });

  test("output without a version number still counts as answered", async () => {
    const p = await runProbe(["/bin/hermes", "--version"], { run: run(0, "hermes ready\n") });
    expect({ ok: p.ok, version: p.version }).toEqual({ ok: true, version: null });
  });

  test("a bare name is refused when the real runner would search PATH", async () => {
    const p = await runProbe(["claude", "--version"]);
    expect({ ran: p.ran, ok: p.ok, error: p.error }).toEqual({ ran: false, ok: false, error: "probe path is not absolute" });
  });

  test("the timeout is a kill, not a wait", async () => {
    const dir = binDir("hermes", "#!/bin/sh\nexec sleep 30\n");
    const started = Date.now();
    const p = await runProbe([join(dir, "hermes"), "--version"], { timeoutMs: 200 });
    expect(p.error).toBe("timeout");
    expect(Date.now() - started).toBeLessThan(5000);
  });
});

describe("detectEngines", () => {
  const answered: ProbeRun = (argv) => ({ code: 0, out: `${argv[0]} 1.2.3\n`, err: "", timedOut: false });

  test("only installed engines are found, and only those are offered", async () => {
    const dirs = [binDir("claude")];
    const engines = await detectEngines({ dirs, run: answered });
    expect(engines.map((e) => [e.id, e.found])).toEqual([
      ["hermes", false], ["claude", true], ["codex", false], ["gemini", false], ["ollama", false],
    ]);
    const detection = await detect({ dirs, run: answered });
    expect(offerable(detection).map((e) => e.id)).toEqual(["claude"]);
    expect(detection.answering).toBe(1);
  });

  test("installed but not answering shows the sign-in command instead of failing", async () => {
    const dirs = [binDir("codex")];
    const engines = await detectEngines({ dirs, run: () => ({ code: 1, out: "", err: "not logged in", timedOut: false }) });
    const codex = engines.find((e) => e.id === "codex")!;
    expect({ found: codex.found, ok: codex.probe.ok, signIn: codex.signIn }).toEqual({ found: true, ok: false, signIn: "codex login" });
  });

  test("the sign-in command is text only: the probe argv is the version command", () => {
    for (const engine of ENGINES) {
      expect(engine.probe).toEqual([engine.command, "--version"]);
      expect(engine.signIn).not.toBe(engine.probe.join(" "));
      expect(engine.signIn).not.toBe("");
    }
  });

  test("an empty PATH finds nothing and still answers", async () => {
    const detection = await detect({ dirs: [], run: answered });
    expect(detection.engines.every((e) => !e.found)).toBe(true);
    expect(detection.answering).toBe(0);
    expect(offerable(detection)).toEqual([]);
  });

  test("the probe argv carries the absolute path found, never the bare name", async () => {
    const dir = binDir("codex");
    let seen: string[] = [];
    await detectEngines({
      dirs: [dir],
      run: (argv) => { seen = argv; return { code: 0, out: "", err: "", timedOut: false }; },
    });
    expect(seen).toEqual([join(dir, "codex"), "--version"]);
  });

  test("a relative PATH entry holding an engine name cannot answer", async () => {
    const real = binDir("hermes", "#!/bin/sh\necho real 1.0.0\n");
    const planted = temp();
    writeFileSync(join(planted, "hermes"), "#!/bin/sh\necho planted 9.9.9\n");
    chmodSync(join(planted, "hermes"), 0o755);

    // Exactly the attack: `PATH=$(pwd)/planted:$PATH` written relative, so a bare `hermes`
    // would run the planted file while the walk skips it.
    const oldPath = process.env.PATH;
    process.env.PATH = `${relative(process.cwd(), planted)}${delimiter}${real}`;
    try {
      const dirs = walkPath();
      expect(dirs).toEqual([real]);

      const engines = await detectEngines({ dirs, timeoutMs: 2000 });
      const hermes = engines.find((e) => e.id === "hermes")!;
      expect(hermes.path).toBe(join(real, "hermes"));
      expect(hermes.probe.version).toBe("real 1.0.0");
    } finally {
      if (oldPath === undefined) delete process.env.PATH; else process.env.PATH = oldPath;
    }
  });
});

describe("no owner default", () => {
  test("a clean-machine detection carries no host, account, URL or token", async () => {
    const detection = await detect({ dirs: [], run: () => ({ code: 0, out: "", err: "", timedOut: false }) });
    const keys: string[] = [];
    const walk = (v: unknown) => {
      if (Array.isArray(v)) return v.forEach(walk);
      if (v && typeof v === "object") for (const [k, inner] of Object.entries(v)) { keys.push(k); walk(inner); }
    };
    walk(detection);
    for (const field of ["host", "account", "token"]) expect(keys).not.toContain(field);
    expect(detection.brain).toEqual({ location: "local", url: "" });
  });

  test("the brain location is a setting and defaults to local", async () => {
    expect((await detect({ dirs: [], run: () => ({ code: 0, out: "", err: "", timedOut: false }) })).brain.location).toBe("local");
    expect((await detect({ dirs: [], brain: { location: "remote", url: "https://brain.example" } })).brain).toEqual({ location: "remote", url: "https://brain.example" });
  });

  test("the module names no host and no owner folder", () => {
    const src = readFileSync(join(import.meta.dir, "..", "core", "detect.ts"), "utf8");
    expect(src).not.toContain("owner/");
    expect(src).not.toContain(".dev"); // a bare .dev host is how a personal name would slip in
    expect(src).not.toContain("http://");
    expect(src).not.toContain("https://");
  });
});

import { PROBE_MS } from "../core/detect";
test("the default probe waits long enough for a slow Python start (Hermes needs 3 to 5 s)", () => expect(PROBE_MS).toBeGreaterThanOrEqual(10_000));
