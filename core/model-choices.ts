// Which models a person can pick: the accounts this machine is signed in to and the local list. Hermes reports every
// model of every provider it is signed in to (Nous Portal and the others) over ACP; Codex reports the ChatGPT models
// its subscription offers; Ollama's engine reports the local ones itself. Nothing is guessed: a tool that does not
// answer offers nothing and its engine keeps its own model. The pick is per engine (one crew member is one engine), so
// changing it in that agent's chat changes only that agent, and it is kept in the store so a reload or a restart keeps it.
import { kv } from "./db";
import type { EngineModel } from "./engines/types";
import { hermesAllowed } from "./host";
import { swrFor } from "./memo";

/** A source that names itself in the id ("nous:anthropic/claude-opus" is Nous Portal's copy of an Anthropic model). */
const SOURCE: Record<string, string> = {
  nous: "Nous Portal", anthropic: "Anthropic", openai: "ChatGPT", "openai-codex": "ChatGPT", google: "Google",
  "x-ai": "xAI", deepseek: "DeepSeek", qwen: "Qwen", moonshotai: "Moonshot AI", minimax: "MiniMax", "z-ai": "Z.ai",
  xiaomi: "Xiaomi", tencent: "Tencent", stepfun: "StepFun", nvidia: "NVIDIA", meta: "Meta", sakana: "Sakana",
  upstage: "Upstage", stealth: "Stealth",
};
const named = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : "");
const GROUP = " · ";

/** One Hermes model as the menu shows it; the provider comes first, so two accounts' copies of one model never look alike. */
export function hermesChoice(id: string, name?: string): EngineModel {
  const at = id.indexOf(":");
  const source = at < 0 ? "" : id.slice(0, at);
  const group = (name?.split(GROUP)[0] || SOURCE[source] || named(source) || "Models").trim();
  return { id, label: name?.trim() || `${group}${GROUP}${id.slice(at + 1)}`, group };
}

/** `session/new`'s answer: every model of every provider this Hermes is signed in to, as Hermes lists them. */
export function parseHermesModels(result: unknown): EngineModel[] {
  const list = (result as { models?: { availableModels?: unknown } } | null)?.models?.availableModels;
  if (!Array.isArray(list)) return [];
  const out: EngineModel[] = [];
  for (const raw of list) {
    const x = raw as { modelId?: unknown; name?: unknown };
    const id = typeof x.modelId === "string" ? x.modelId.trim() : "";
    if (!id || out.some((m) => m.id === id)) continue;
    out.push(hermesChoice(id, typeof x.name === "string" ? x.name : undefined));
  }
  return out;
}

/** `codex debug models`: the ChatGPT models this sign-in offers; a hidden one is not a choice. */
export function parseCodexModels(json: unknown): EngineModel[] {
  const list = (json as { models?: unknown } | null)?.models;
  if (!Array.isArray(list)) return [];
  const out: EngineModel[] = [];
  for (const raw of list) {
    const m = raw as { slug?: unknown; display_name?: unknown; visibility?: unknown };
    const id = typeof m.slug === "string" ? m.slug.trim() : "";
    if (!id || m.visibility === "hide" || out.some((x) => x.id === id)) continue;
    const name = typeof m.display_name === "string" && m.display_name.trim() ? m.display_name.trim() : id;
    out.push({ id, label: `ChatGPT${GROUP}${name}`, group: "ChatGPT" });
  }
  return out;
}

/** The ACP handshake that asks Hermes for its models; bounded, and an answer never seen leaves the list empty. */
async function runAcp(path: string, timeoutMs = 30_000): Promise<EngineModel[]> {
  const p = Bun.spawn([path, "acp"], { stdin: "pipe", stdout: "pipe", stderr: "ignore" });
  const send = (id: number, method: string, params: unknown) => {
    try { p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"); p.stdin.flush(); } catch { /* its stdin is closed */ }
  };
  send(1, "initialize", { protocolVersion: 1, clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false } });
  send(2, "session/new", { cwd: process.env.HOME ?? "/", mcpServers: [] });
  const timer = setTimeout(() => { try { p.kill(); } catch { /* already gone */ } }, timeoutMs);
  const dec = new TextDecoder(); let buf = "";
  try {
    for await (const chunk of p.stdout as AsyncIterable<Uint8Array>) {
      buf += dec.decode(chunk, { stream: true });
      let i: number;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        let m: { id?: number; result?: unknown };
        try { m = JSON.parse(line); } catch { continue; }
        if (m.id === 2) return parseHermesModels(m.result);
      }
    }
    return [];
  } finally { clearTimeout(timer); try { p.kill(); } catch { /* done */ } }
}

async function runCodex(path: string): Promise<EngineModel[]> {
  const p = Bun.spawn([path, "debug", "models"], { stdin: "ignore", stdout: "pipe", stderr: "ignore" });
  const timer = setTimeout(() => { try { p.kill(); } catch { /* already gone */ } }, 20_000);
  try {
    const text = await new Response(p.stdout as ReadableStream).text();
    return parseCodexModels(JSON.parse(text));
  } catch { return []; } finally { clearTimeout(timer); }
}

// One probe answers for every engine: the accounts belong to the machine, not to one profile, so nine crew engines
// cost one five-second handshake, shared and refreshed every ten minutes.
export const hermesChoices = swrFor(10 * 60_000, async (): Promise<EngineModel[]> => {
  const path = hermesAllowed() ? Bun.which("hermes") : null;
  if (!path) return [];
  try { return await runAcp(path); } catch { return []; }
});
export const codexChoices = swrFor(10 * 60_000, async (): Promise<EngineModel[]> => {
  const path = Bun.which("codex");
  if (!path) return [];
  try { return await runCodex(path); } catch { return []; }
});

const picks = kv("model-pick");
/** The key a choice is kept under: "Caesar alone" is the same agent as Caesar, so the two share one pick. */
const keyOf = (engine: string): string => engine.replace(/!alone$/, "");
/** The model this engine answers with when the turn names none. */
export const pickedModel = (engine: string): string => picks.get<string>(keyOf(engine), "");
/** Keep a choice for one engine; an empty model clears it and the tool's own default comes back. */
export function chooseModel(engine: string, model: string): void { if (model) picks.set(keyOf(engine), model); else picks.delete(keyOf(engine)); }
/** What a turn really uses: the model it names wins, while the tool still offers it; "default" (and none) mean the
 *  engine's pick. A list that could not be read says nothing, so a named model is kept rather than dropped. */
export function effectiveModel(engine: string, asked: string, offered: EngineModel[]): string {
  const known = (id: string) => !offered.length || offered.some((m) => m.id === id);
  if (asked && asked !== "default") return known(asked) ? asked : "";
  const pick = pickedModel(engine);
  return pick && known(pick) ? pick : "";
}
/** The pick first, so a chat that names no model opens on it. A pick the tool no longer offers is only ignored. */
export function withPick(engine: string, models: EngineModel[]): EngineModel[] {
  const at = models.findIndex((m) => m.id === pickedModel(engine));
  return at > 0 ? [models[at]!, ...models.slice(0, at), ...models.slice(at + 1)] : models;
}
