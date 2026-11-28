// The crew: the Hermes profiles on this machine. Each profile is one crew member with its own soul, model and memory.
// This reads which profiles exist, gives each a chat engine (`hermes -p <profile> -z <prompt>`, one answer per call)
// and reports who is working right now. Nothing is created or changed in a profile here.
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { homedir } from "node:os";
import { join } from "node:path";
import { hermesAllowed, hermesHome } from "./host";
import type { Context, Hono } from "hono";
import { ENGINES, detectEngines } from "./detect";
import type { EngineAdapter, EngineEvent } from "./engines/types";
import { listEngines, registerEngine, unregisterEngine } from "./engines/registry";
import { memoFor } from "./memo";
import { effectiveModel, hermesChoices, withPick } from "./model-choices";
import { hermesScope, scopeOf } from "./scope";
import { change, cleanLine, ID_RE, readRoster, writeRoster } from "./roster";

const PROFILES = () => join(hermesHome(), "profiles");

/** What each known crew member is for. A profile not listed here is still a crew member, with a plain role. */
const KNOWN: Record<string, { name: string; role: string; does: string; img: string }> = {
  caesar: { name: "Caesar", role: "Commander", does: "leads, plans, delegates, verifies", img: "art/caesaros-caesar-neo.webp" },
  vitruvius: { name: "Vitruvius", role: "Developer", does: "builds CAESAR core, plugins, tools and tests", img: "art/caesaros-crew-vitruvius.webp" },
  agrippa: { name: "Agrippa", role: "Art direction", does: "pages, art direction, images in CAESAR style", img: "art/caesaros-crew-agrippa.webp" },
  varro: { name: "Varro", role: "Librarian", does: "research, writing, docs and the changelog", img: "art/caesaros-crew-varro.webp" },
  calpurnia: { name: "Calpurnia", role: "Assistant", does: "runs the day: reminders, drafts, the morning brief", img: "art/caesaros-crew-calpurnia.webp" },
  annona: { name: "Annona", role: "Sysop", does: "servers, backups, health", img: "art/caesaros-crew-annona.webp" },
  balbus: { name: "Balbus", role: "Coordinator", does: "milestones and status", img: "art/caesaros-crew-balbus.webp" },
  clientdev: { name: "ClientDev", role: "Client builds", does: "client edition and installs", img: "art/caesaros-crew-clientdev.webp" },
};
const ORDER = Object.keys(KNOWN);

export type CrewMember = { id: string; name: string; role: string; does: string; img: string; model: string; status: "work" | "idle"; doing: string; at: number | null };

/** Who is mid-answer right now, with what they were asked (the first words) and when it started. */
const working = new Map<string, { doing: string; at: number }[]>();

const modelOf = (dir: string): string => {
  try {
    const m = /^\s*model:\s*\n(?:[^\n]*\n)*?\s+default:\s*['"]?([^\s'"#]+)/m.exec(readFileSync(join(dir, "config.yaml"), "utf8")) ?? /^\s*default:\s*['"]?([^\s'"#]+)/m.exec(readFileSync(join(dir, "config.yaml"), "utf8"));
    return m?.[1] ?? "";
  } catch { return ""; }
};

/** The Hermes profiles as crew. Retired members are left out unless `retired` is set; the roster's own names and roles win. */
export function listCrew(opts: { retired?: boolean } = {}): CrewMember[] {
  const root = PROFILES(), ro = readRoster();
  if (!existsSync(root)) return [];
  const ids = readdirSync(root).filter((d) => /^[a-z0-9][a-z0-9_-]*$/i.test(d) && statSync(join(root, d)).isDirectory());
  const shown = ids.filter((id) => opts.retired ? ro.retired.includes(id) : !ro.retired.includes(id));
  shown.sort((a, b) => (ORDER.indexOf(a) < 0 ? 99 : ORDER.indexOf(a)) - (ORDER.indexOf(b) < 0 ? 99 : ORDER.indexOf(b)) || a.localeCompare(b));
  return shown.map((id) => {
    const k = KNOWN[id], jobs = working.get(id) ?? [];
    return { id, name: ro.names[id] ?? k?.name ?? id[0].toUpperCase() + id.slice(1), role: ro.roles[id] ?? k?.role ?? "Agent", does: k?.does ?? "a Hermes profile on this machine", img: k?.img ?? "art/caesaros-caesar-neo.webp", model: modelOf(join(root, id)), status: jobs.length ? "work" : "idle", doing: jobs[0]?.doing ?? "", at: jobs[0]?.at ?? null };
  });
}

const flatten = (m: { role: string; content: string }[]) =>
  m.length === 1 ? m[0].content : m.map((x) => `${x.role === "assistant" ? "You" : x.role === "system" ? "Note" : "Operator"}: ${x.content}`).join("\n\n");

/** One chat engine per profile. `hermes -p <id> -z <prompt>` answers once and exits; the crew member keeps its own tools. */
/** Caesar on his own: the same profile with delegation and the kanban switched off, so he works without the crew. */
const SOLO_TOOLSETS = "web,browser,terminal,file,code_execution,vision,skills,todo,memory,session_search,connections,clarify,caesar-brain,caesar-computer,klieg,omh,image_gen,tts,computer_use";
export const SOLO_ID = "hermes:caesar!alone";

/** Names a Hermes install knows, read from `hermes tools list` (built-in and plugin toolsets, enabled or not, and MCP server names). */
export function parseToolsetNames(out: string): Set<string> {
  const names = new Set<string>();
  for (const l of out.split("\n")) {
    const m = /^\s*[✓✗]\s+(?:enabled|disabled)\s+(\S+)/.exec(l) ?? /^\s{2}([\w-]+)\s{2,}(?:all tools|\d+ tool)/.exec(l);
    if (m) names.add(m[1]);
  }
  return names;
}
/** The solo list without the names this Hermes does not know: an older Hermes answers `-t klieg` with invalid_params and no reply at all. */
export const knownToolsets = (list: string, known: Set<string>) => (known.size ? list.split(",").filter((t) => known.has(t)).join(",") : list);
const toolsetCache = new Map<string, { at: number; set: Set<string> }>();
async function hermesToolsets(path: string, id: string): Promise<Set<string>> {
  const key = `${path}:${id}`, hit = toolsetCache.get(key);
  if (hit && Date.now() - hit.at < 600_000) return hit.set;
  try {
    const p = Bun.spawn([path, "-p", id, "tools", "list"], { stdin: "ignore", stdout: "pipe", stderr: "ignore" });
    const t = setTimeout(() => { try { p.kill(); } catch { /* done */ } }, 8000);
    const out = await new Response(p.stdout).text(); clearTimeout(t);
    const set = parseToolsetNames(out); toolsetCache.set(key, { at: Date.now(), set }); return set;
  } catch { return new Set(); }   // unknown: send the full list as before
}

/** One Hermes one-shot run: its argv, with the model flag where `hermes chat` reads it (a model the tool offers, or none). */
export function hermesChatArgs(path: string, o: { profile: string; toolsets?: string; model?: string; queryFile: string }): string[] {
  return [path, "-p", o.profile, ...(o.toolsets ? ["-t", o.toolsets] : []), "chat", "-Q", "--oneshot", "--format", "stream-json", ...(o.model ? ["-m", o.model] : []), "--query-file", o.queryFile];
}

/** One line of `hermes chat --format stream-json` as engine events. Text becomes deltas, a tool_use opens a row and its tool_result closes it
 *  (with the time Hermes measured); the first "Session:" line, the final summary and anything not JSON produce nothing. */
export function streamLine(line: string): EngineEvent[] {
  let j: { type?: string; text?: string; name?: string; tool_call_id?: string; input?: unknown; output?: unknown; duration_ms?: number; is_error?: boolean };
  try { j = JSON.parse(line); } catch { return []; }
  if (j.type === "text" && typeof j.text === "string") return [{ type: "delta", text: j.text }];
  if (j.type === "tool_use" && j.name && j.tool_call_id) return [{ type: "tool", call: { id: j.tool_call_id, name: j.name, status: "running", input: j.input === undefined ? undefined : JSON.stringify(j.input).slice(0, 2000) } }];
  if (j.type === "tool_result" && j.name && j.tool_call_id) return [{ type: "tool", call: { id: j.tool_call_id, name: j.name, status: j.is_error ? "error" : "ok", output: j.output === undefined ? undefined : String(j.output).slice(0, 4000), ms: typeof j.duration_ms === "number" ? j.duration_ms : undefined } }];
  return [];
}

/** Hermes appends a line "Memory: ..." to a one-shot answer; it is housekeeping, not part of the reply. */
export function stripMemoryTail(acc: string): number { const i = acc.indexOf("\n\nMemory:"); return i; }

export function hermesCrewEngines(): EngineAdapter[] {
  const entry = ENGINES.find((e) => e.id === "hermes")!;
  const find = memoFor(60_000, () => detectEngines({ engines: [entry] }).then((r) => r[0]));   // one probe shared by every crew engine
  const crew = listCrew();
  const variants = [...crew.map((m) => ({ m, solo: false })), ...crew.filter((m) => m.id === "caesar").map((m) => ({ m, solo: true }))];
  // The models of every account this Hermes is signed in to; a Hermes that cannot answer leaves the profile's own.
  const offer = (fallback: string) => hermesChoices().catch(() => []).then((list) => (list.length ? list : [{ id: "default", label: fallback }]));
  const idOf = (m: { id: string }, solo: boolean) => solo ? SOLO_ID : `hermes:${m.id}`;
  return variants.map(({ m, solo }): EngineAdapter => ({
    id: idOf(m, solo),
    label: solo ? "Caesar (alone)" : m.name,
    scope: () => hermesScope(m.id),
    async health() { const r = await find(); return r?.found ? (r.probe.ok || r.probe.error === "timeout" ? { ok: true, detail: null } : { ok: false, detail: `installed, sign in: ${entry.signIn}` }) : { ok: false, detail: "Hermes is not installed" }; },
    async models() { return withPick(idOf(m, solo), await offer(m.model || "profile default")); },
    async *stream(messages, { model, signal }): AsyncIterable<EngineEvent> {
      const r = await find();
      if (!r?.path) throw new Error("Hermes is not installed");
      const prompt = flatten(messages);
      // The prompt goes through a private file (not argv), and the answer comes back as stream-json so tool calls are seen.
      const dir = mkdtempSync(join(tmpdir(), "caesaros-hermes-")), qf = join(dir, "q.txt"); writeFileSync(qf, prompt, { mode: 0o600 });
      const toolsets = solo ? knownToolsets(SOLO_TOOLSETS, await hermesToolsets(r.path, m.id)) : undefined;
      const use = effectiveModel(idOf(m, solo), model, await offer(m.model || "profile default"));
      const proc = Bun.spawn(hermesChatArgs(r.path, { profile: m.id, toolsets, model: use, queryFile: qf }), { stdin: "ignore", stdout: "pipe", stderr: "pipe" });
      const kill = () => { try { proc.kill(); } catch { /* already gone */ } };
      signal?.addEventListener("abort", kill, { once: true });
      const jobs = working.get(m.id) ?? []; jobs.push({ doing: prompt.slice(0, 80), at: Date.now() }); working.set(m.id, jobs);
      const dec = new TextDecoder();
      let buf = "", acc = "", sent = 0, cut = false;
      try {
        for await (const chunk of proc.stdout as AsyncIterable<Uint8Array>) {
          if (signal?.aborted) return;
          buf += dec.decode(chunk, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
            for (const ev of streamLine(line)) {
              if (ev.type !== "delta") { yield ev; continue; }
              if (cut) continue;
              acc += ev.text; const i = stripMemoryTail(acc);
              const upto = i >= 0 ? i : acc.length; if (i >= 0) cut = true;
              if (upto > sent) { yield { type: "delta", text: acc.slice(sent, upto) }; sent = upto; }
            }
          }
        }
        if (signal?.aborted) return;
        const code = await proc.exited;
        if (code !== 0) {
          const err = (await new Response(proc.stderr as ReadableStream).text()).replace(/\s+/g, " ").trim().slice(0, 200);
          throw new Error(`${m.name} exited ${code}${err ? `: ${err}` : ""}`);
        }
        yield { type: "done" };
      } finally {
        kill(); signal?.removeEventListener("abort", kill); rmSync(dir, { recursive: true, force: true });
        const left = (working.get(m.id) ?? []).filter((x) => x.doing !== prompt.slice(0, 80)); if (left.length) working.set(m.id, left); else working.delete(m.id);
      }
    },
  }));
}

export type Target = { id: string; label: string; role: string; ok: boolean; detail: string | null; group: "caesar" | "tools" | "crew"; scope?: "local" | "cloud" };

/** Who answers a newcomer's first message, never the order the engines were detected in: Caesar alone when he is
 *  there, then a Hermes main profile, then Claude Code, Codex, a local Ollama model, any other model server. */
const AFTER_MAIN = ["claude", "codex", "ollama"];

export function defaultTarget(targets: Target[]): { target: Target | null; message: string | null } {
  const ok = targets.filter((t) => t.ok);
  const pick = ok.find((t) => t.id === SOLO_ID)
    ?? ok.find((t) => t.id === "hermes:caesar")
    ?? ok.find((t) => t.id.startsWith("hermes:"))
    ?? AFTER_MAIN.map((id) => ok.find((t) => t.id === id)).find((t) => t)
    ?? ok.find((t) => t.role === "Model server");
  return pick ? { target: pick, message: null } : {
    target: null,
    message: ok.length === 0 && targets.some((t) => t.detail === LOCAL_ONLY_NOTE)
      ? "Local only is on and no local model is available. Start Ollama or a local model server, or switch Local only off."
      : "No engine can answer yet. Install Ollama for a model on this machine, or sign in to Claude Code or Codex, then try again.",
  };
}

/** Everything a person can start a conversation with, grouped the way the picker shows it. */
export const LOCAL_ONLY_NOTE = "cloud engine, Local only is on";
export async function chatTargets(localOnly = false): Promise<Target[]> {
  const eng = listEngines();
  const health = new Map(await Promise.all(eng.map(async (e) => [e.id, await e.health().catch(() => ({ ok: false, detail: "not answering" }))] as const)));
  const out: Target[] = [];
  const scoped = (id: string, t: Target): Target => {
    const e = eng.find((x) => x.id === id); const scope = e ? scopeOf(e) : "cloud";
    return localOnly && scope === "cloud" ? { ...t, scope, ok: false, detail: LOCAL_ONLY_NOTE } : { ...t, scope };
  };
  const solo = health.get(SOLO_ID);
  if (solo) out.push(scoped(SOLO_ID, { id: SOLO_ID, label: "Caesar", role: "Alone, without the crew", ok: solo.ok, detail: solo.detail, group: "caesar" }));
  for (const e of eng) {
    if (e.id.startsWith("hermes:")) continue;
    const h = health.get(e.id)!;
    out.push(scoped(e.id, { id: e.id, label: e.label, role: e.id === "claude" || e.id === "codex" || e.id === "gemini" ? "Coding tool" : "Model server", ok: h.ok, detail: h.detail, group: "tools" }));
  }
  for (const m of listCrew()) { const h = health.get(`hermes:${m.id}`); if (h) out.push(scoped(`hermes:${m.id}`, { id: `hermes:${m.id}`, label: m.name, role: m.role, ok: h.ok, detail: h.detail, group: "crew" })); }
  return out;
}

/** Run `hermes profile create` for a new member; the error is a short word, never the profile's contents. */
async function hermesCreate(id: string): Promise<"ok" | "hermes_missing" | "failed"> {
  const bin = Bun.which("hermes") ?? join(homedir(), ".local", "bin", "hermes");
  if (!hermesAllowed() || !existsSync(bin)) return "hermes_missing";
  try {
    const p = Bun.spawn([bin, "profile", "create", "--no-alias", id], { stdin: "ignore", stdout: "ignore", stderr: "ignore" });
    const t = setTimeout(() => p.kill(), 60_000); const code = await p.exited; clearTimeout(t);
    return code === 0 ? "ok" : "failed";
  } catch { return "failed"; }
}

/** After the roster changes, the chat engines follow it without a restart: only the Hermes ones are swapped. */
function syncCrewEngines(): void {
  for (const e of listEngines()) if (e.id.startsWith("hermes:")) unregisterEngine(e.id);
  for (const e of hermesCrewEngines()) registerEngine(e);
}

export function crewApi(app: Hono, localOnly: () => boolean = () => false, isOperator: (c: Context) => boolean = () => true): void {
  app.get("/api/crew", (c) => c.json(listCrew()));
  // retired members, so the Lair can offer to bring them back
  app.get("/api/crew/retired", (c) => c.json(listCrew({ retired: true })));
  // hire (a new Hermes profile), rename and retire/restore: operator only, and only the roster file changes except for a hire
  app.post("/api/crew", async (c) => {
    if (!isOperator(c)) return c.json({ error: "operator_only" }, 403);
    const b = await c.req.json().catch(() => ({})) as { id?: string; name?: string; role?: string };
    const id = cleanLine(b.id, 32).toLowerCase();
    if (!ID_RE.test(id)) return c.json({ error: "id" }, 400);
    if (listCrew({ retired: true }).concat(listCrew()).some((m) => m.id === id)) return c.json({ error: "exists" }, 409);
    const made = await hermesCreate(id);
    if (made !== "ok") return c.json({ error: made }, made === "hermes_missing" ? 409 : 502);
    writeRoster(change(readRoster(), id, { name: b.name ?? "", role: b.role ?? "" })); syncCrewEngines();
    return c.json({ ok: true, id });
  });
  app.patch("/api/crew/:id", async (c) => {
    if (!isOperator(c)) return c.json({ error: "operator_only" }, 403);
    const id = c.req.param("id"), b = await c.req.json().catch(() => ({})) as { name?: string; role?: string; retired?: boolean };
    if (!listCrew({ retired: true }).concat(listCrew()).some((m) => m.id === id)) return c.json({ error: "unknown" }, 404);
    if (b.retired === true && id === "caesar") return c.json({ error: "caesar_stays" }, 400);
    writeRoster(change(readRoster(), id, { name: typeof b.name === "string" ? b.name : undefined, role: typeof b.role === "string" ? b.role : undefined, retire: typeof b.retired === "boolean" ? b.retired : undefined })); syncCrewEngines();
    return c.json({ ok: true });
  });
  app.get("/api/chat-targets", async (c) => c.json(await chatTargets(localOnly())));
  // who answers a first message and a new chat: the preference order above, not detection order
  app.get("/api/chat-targets/default", async (c) => {
    const { target, message } = defaultTarget(await chatTargets(localOnly()));
    return c.json({ id: target?.id ?? "", label: target?.label ?? "", message: message ?? "" });
  });
}
