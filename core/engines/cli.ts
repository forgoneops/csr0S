// Chat through a tool the person already has installed (Claude Code, Codex). One adapter per entry in
// the detect.ts allowlist: argv only, never a shell, run in an empty scratch directory with the tool's own
// agent powers switched off, so a chat message cannot read files or run commands. Nothing is installed,
// signed in or read from the tool's config here; if it does not answer, health says so and the sign-in
// command from detect.ts is shown to the person.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ENGINES, detectEngines } from "../detect";
import { codexChoices, effectiveModel, withPick } from "../model-choices";
import { memoFor } from "../memo";
import type { ChatMessage, EngineAdapter, EngineEvent, EngineHealth } from "./types";

/** `modelArg`: the flag its CLI takes right after the subcommand (`codex exec -m …`); none means it chooses for itself. */
type Spec = { id: string; args: string[]; modelArg?: string };

/** Per tool: the non-interactive text mode, agent tools off. The prompt goes in on stdin, never in argv. */
const SPECS: Spec[] = [
  { id: "claude", args: ["-p", "--tools", "", "--no-session-persistence", "--setting-sources", "project"] },
  { id: "codex", args: ["exec", "--skip-git-repo-check", "--ephemeral", "--sandbox", "read-only", "--color", "never", "-"], modelArg: "-m" },
  // UNVERIFIED: gemini is not installed on the build machine; -p is its non-interactive flag and tool calls are denied without approval there. Check on a machine that has it.
  { id: "gemini", args: ["-p"] },
];

export const CLI_TOOLS = new Set(SPECS.map((s) => s.id));

/** The argv for one run; a tool's model flag goes right after its subcommand, before the stdin marker it ends with. */
export const argvWithModel = (path: string, spec: Spec, model: string): string[] =>
  spec.modelArg && model ? [path, ...spec.args.slice(0, 1), spec.modelArg, model, ...spec.args.slice(1)] : [path, ...spec.args];

const flatten = (m: ChatMessage[]) => m.map((x) => `${x.role === "assistant" ? "Assistant" : x.role === "system" ? "System" : "User"}: ${x.content}`).join("\n\n") + "\n\nAssistant:";

type Opts = { dirs?: string[]; spawn?: typeof Bun.spawn };

export function createCliEngine(spec: Spec, opts: Opts = {}): EngineAdapter {
  const entry = ENGINES.find((e) => e.id === spec.id);
  if (!entry) throw new Error(`unknown tool ${spec.id}`);
  const find = opts.dirs || opts.spawn ? () => detectEngines({ engines: [entry], dirs: opts.dirs }).then((r) => r[0]) : memoFor(10_000, () => detectEngines({ engines: [entry] }).then((r) => r[0]));   // tests inject dirs and get no cache

  return {
    id: spec.id,
    label: entry.label,
    async health(): Promise<EngineHealth> {
      const r = await find();
      if (!r?.found) return { ok: false, detail: "not detected" };
      return r.probe.ok ? { ok: true, detail: null } : { ok: false, detail: `installed, sign in: ${entry.signIn}` };
    },
    // A tool that lists its own models offers them; one that does not chooses for itself, and no name is guessed.
    async models() {
      if (!spec.modelArg) return [{ id: "default", label: "Tool default" }];
      const list = await codexChoices().catch(() => []);
      return withPick(spec.id, list.length ? list : [{ id: "default", label: "Tool default" }]);
    },
    async *stream(messages, { model, signal }): AsyncIterable<EngineEvent> {
      const r = await find();
      if (!r?.path) throw new Error(`${entry.label} is not installed`);
      const cwd = mkdtempSync(join(tmpdir(), "caesaros-cli-"));
      const use = spec.modelArg ? effectiveModel(spec.id, model ?? "", await codexChoices().catch(() => [])) : "";
      const proc = (opts.spawn ?? Bun.spawn)(argvWithModel(r.path, spec, use), { cwd, stdin: "pipe", stdout: "pipe", stderr: "pipe" });
      const kill = () => { try { proc.kill(); } catch { /* already gone */ } };
      signal?.addEventListener("abort", kill, { once: true });
      proc.stdin.write(flatten(messages)); proc.stdin.end();
      const decoder = new TextDecoder();
      try {
        for await (const chunk of proc.stdout as AsyncIterable<Uint8Array>) {
          if (signal?.aborted) return;
          const text = decoder.decode(chunk, { stream: true });
          if (text) yield { type: "delta", text };
        }
        if (signal?.aborted) return;
        const code = await proc.exited;
        if (code !== 0) {
          const raw = await new Response(proc.stderr as ReadableStream).text();
          // the tool's own words first: its ERROR line (a usage limit, a missing sign-in), not its start-up banner
          const said = [...raw.matchAll(/^\s*(?:ERROR|Error|error):\s*(.+)$/gm)].map((m) => m[1].trim()).at(-1);
          const err = (said ?? raw.replace(/\s+/g, " ").trim()).slice(0, 300);
          throw new Error(`${entry.label} exited ${code}${err ? `: ${err}` : ""}`);
        }
        yield { type: "done" };
      } finally { kill(); signal?.removeEventListener("abort", kill); }
    },
  };
}

export const cliEngines = (): EngineAdapter[] => SPECS.map((s) => createCliEngine(s));
