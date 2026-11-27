// The Hermes configuration, read-only (plan 7.8/7.9): what one profile's config.yaml says, minus everything that must stay
// private. A provider, a model name, the bare host of a base URL, where it runs, the reasoning effort, the delegation and
// fallback blocks, the enabled plugins and the toolsets are shown; a key, token, password or anything that looks like one
// is never returned, not even masked. A shape this reader does not understand is named in `notRead`, never guessed at.
import type { Context, Hono } from "hono";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { findExecutable, walkPath } from "./detect";
import { isLocalUrl } from "./scope";
import { hermesAllowed, hermesHome } from "./host";

export type Scope = "local" | "cloud";
export type Block = { provider: string | null; model: string | null };
export type HermesConf = {
  profile: string;
  provider: string | null;
  model: string | null;
  baseUrlHost: string | null;
  scope: Scope;
  reasoningEffort: string | null;
  delegation: Block | null;
  fallback: Block | null;
  plugins: string[];
  toolsets: string[];
  notRead: string[];
};

// A key, token or password anywhere in a value: it is dropped instead of shown. Matches the shapes tools use, plus a
// `name: value` pair naming one, so a pasted `api_key: …` can never ride along inside a field meant for a model name.
const SECRET = /(sk-[A-Za-z0-9_-]{12,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{20,}|xox[abp]-[A-Za-z0-9-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:api[_-]?key|access[_-]?token|secret|password|passwd|bearer)\s*[:=]\s*\S+)/i;
const LOCAL_PROVIDERS = /^(ollama|lmstudio|lm-studio|llama\.?cpp|llamacpp|vllm|local)$/i;   // the rule in core/scope.ts, kept here so the reader stays pure
const unquote = (s: string): string => {
  const q = s[0];
  return s.length > 1 && (q === "'" || q === '"') && s.endsWith(q) ? s.slice(1, -1) : s;
};
const clean = (v: string | undefined): string | null => {
  if (v === undefined) return null;
  const s = unquote(v.replace(/\s+#.*$/, "").trim());
  return s && !SECRET.test(s) ? s : null;
};

/** The lines of one top-level `name:` block, without the header. Empty when the key is absent or written inline. */
function block(yaml: string, name: string): string {
  const lines = yaml.split("\n");
  const at = lines.findIndex((l) => new RegExp(`^${name}:\\s*(#.*)?$`).test(l));
  if (at < 0) return "";
  let end = at + 1;
  while (end < lines.length && (/^\s/.test(lines[end]) || lines[end].trim() === "" || lines[end].startsWith("#"))) end++;
  return lines.slice(at + 1, end).join("\n");
}

/** A scalar inside a block, at any depth: the first `key: value` line. */
const scalar = (blockText: string, key: string): string | null => {
  const m = new RegExp(`^[ \\t]+${key}:[ \\t]*(.+)$`, "m").exec(blockText);
  return clean(m?.[1]);
};

/** The `- item` entries of the block, or of its first sub-list (a `key:` line followed by items). */
function items(blockText: string): string[] {
  const m = /(?:^|\n)[ \t]*(?:[\w-]+:[ \t]*\n)?((?:[ \t]*-[ \t]*.+\n?)+)/.exec(blockText);
  if (!m) return [];
  return m[1].split("\n").map((l) => clean(/^[ \t]*-[ \t]*(.+)$/.exec(l)?.[1])).filter((x): x is string => !!x);
}

/** The items under one named sub-list of a block (`cli:` in `platform_toolsets:`). */
function subItems(blockText: string, key: string): string[] {
  const m = new RegExp(`(?:^|\\n)[ \\t]+${key}:[ \\t]*\\n((?:[ \\t]+-[ \\t]*.+\\n?)+)`).exec(blockText);
  return m ? items(m[1]) : [];
}

/** Hermes' own default for its local API server; the person's config may name another port. */
export const GATEWAY_PORT = 8642;
export function gatewayPort(yaml: string): number {
  const api = /(?:^|\n)[ \t]+api_server:[ \t]*\n((?:[ \t]+.*\n?)+)/.exec(block(yaml, "gateway"))?.[1] ?? "";
  const p = Number(/^[ \t]+port:[ \t]*(\d+)/m.exec(api)?.[1]);
  return Number.isInteger(p) && p > 0 && p < 65536 ? p : GATEWAY_PORT;
}

const blockOf = (text: string): Block | null => {
  const provider = scalar(text, "provider"), model = scalar(text, "model") ?? scalar(text, "default");
  return provider || model ? { provider, model } : null;
};

/** One profile's config, sanitized. Pure: a string in, a string out; nothing touches the disk here. */
export function readHermesConf(profile: string, yaml: string): HermesConf {
  const notRead: string[] = [];
  const modelB = block(yaml, "model");
  const provider = clean(scalar(modelB, "provider") ?? undefined);
  const model = clean(scalar(modelB, "default") ?? undefined);
  if (!provider || !model) notRead.push("model");
  const rawBase = scalar(modelB, "base_url");
  let baseUrlHost: string | null = null;
  if (rawBase) { try { baseUrlHost = new URL(rawBase).hostname || null; } catch { notRead.push("base_url"); } }

  const agentB = block(yaml, "agent");
  const reasoningEffort = scalar(agentB, "reasoning_effort");
  if (!reasoningEffort) notRead.push("agent");

  const delegation = blockOf(block(yaml, "delegation"));
  const fallback = blockOf(block(yaml, "fallback_model"));

  const plugins = items(block(yaml, "plugins"));
  if (!plugins.length) notRead.push("plugins");
  const ownToolsets = items(block(yaml, "toolsets"));
  const toolsets = ownToolsets.length ? ownToolsets : subItems(block(yaml, "platform_toolsets"), "cli");
  if (!toolsets.length) notRead.push("toolsets");

  const scope: Scope = (provider !== null && LOCAL_PROVIDERS.test(provider)) || (rawBase !== null && isLocalUrl(rawBase)) ? "local" : "cloud";
  return { profile, provider, model, baseUrlHost, scope, reasoningEffort, delegation, fallback, plugins, toolsets, notRead };
}

/** Version and install method from `hermes --version`; nulls when the output does not say. */
export function parseHermesVersion(out: string): { version: string | null; installMethod: string | null } {
  return {
    version: /\bv(\d+\.\d+(?:\.\d+)?)/.exec(out)?.[1] ?? null,
    installMethod: /^Install method:\s*(\S+)/mi.exec(out)?.[1] ?? null,
  };
}

export type RunResult = { code: number | null; out: string; err: string };
export type RunFn = (argv: string[], timeoutMs: number) => RunResult | Promise<RunResult>;

/** Bun.spawn, never a shell, bounded in time, like core/detect.ts runs its probes. */
async function defaultRun(argv: string[], timeoutMs: number): Promise<RunResult> {
  const p = Bun.spawn(argv, { stdout: "pipe", stderr: "pipe", stdin: "ignore" });
  const collected = (async () => {
    const [code, out, err] = await Promise.all([p.exited, new Response(p.stdout).text(), new Response(p.stderr).text()]);
    return { code, out, err };
  })();
  collected.catch(() => {});
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<RunResult>((resolve) => { timer = setTimeout(() => { p.kill(); resolve({ code: null, out: "", err: "timeout" }); }, timeoutMs); });
  try { return await Promise.race([collected, timeout]); } finally { clearTimeout(timer); }
}

/** "default" plus every profile folder, the same ids and order core/crew.ts lists. */
function profilesIn(home: string): string[] {
  const root = join(home, "profiles");
  const ids = existsSync(root)
    ? readdirSync(root).filter((d) => /^[a-z0-9][a-z0-9_-]*$/i.test(d) && statSync(join(root, d)).isDirectory()).sort((a, b) => a.localeCompare(b))
    : [];
  return ["default", ...ids];
}

const configOf = (home: string, profile: string): string => {
  const f = profile === "default" ? join(home, "config.yaml") : join(home, "profiles", profile, "config.yaml");
  try { return existsSync(f) ? readFileSync(f, "utf8") : ""; } catch { return ""; }
};

export type HermesInfo = { version: string | null; installMethod: string | null; gateway: boolean };

/** Does the gateway listen on its local API port? A refused connection is "no"; any answer is "yes". */
export async function gatewayAnswers(port: number, timeoutMs = 1000): Promise<boolean> {
  try { await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(timeoutMs) }); return true; } catch { return false; }
}

export function hermesConfApi(
  app: Hono,
  isOperator: (c: Context) => boolean = () => true,
  opts: { dir?: string; run?: RunFn; hermesPath?: string | null; probeGateway?: (port: number) => Promise<boolean> } = {},
): void {
  app.get("/api/hermes/config", async (c) => {
    if (!isOperator(c)) return c.json({ error: "operator_only" }, 403);
    const home = opts.dir ?? hermesHome();
    const defaultConfig = configOf(home, "default");
    const profiles = profilesIn(home).map((p) => readHermesConf(p, configOf(home, p)));
    const run = opts.run ?? defaultRun;
    const path = opts.hermesPath !== undefined ? opts.hermesPath : hermesAllowed() ? findExecutable("hermes", walkPath()) : null;
    // `hermes gateway status` takes eight seconds on a warm install; the listener answers in a millisecond.
    const gateway = await (opts.probeGateway ?? (hermesAllowed() ? gatewayAnswers : async () => false))(gatewayPort(defaultConfig));
    let hermes: HermesInfo = { version: null, installMethod: null, gateway };
    if (path) {
      const version = await Promise.resolve(run([path, "--version"], 3000)).catch((): RunResult => ({ code: null, out: "", err: "" }));
      hermes = { ...parseHermesVersion(`${version.out}\n${version.err}`), gateway };
    }
    return c.json({ profiles, hermes });
  });
}
