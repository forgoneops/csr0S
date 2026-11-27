#!/usr/bin/env bun
// Plan 7.7: give Hermes, Claude Code or Codex, started by hand, the same Brain as CaesarOS.
//   bun tools/attach.ts <hermes|claude-code|codex>             dry run: says what it would change, writes nothing
//   bun tools/attach.ts <hermes|claude-code|codex> --apply     writes it, after a backup of every file it edits
//   bun tools/attach.ts <hermes|claude-code|codex> --remove    takes out exactly what this tool added, nothing else
// Config dirs follow the agent's own variables (HERMES_HOME, CLAUDE_CONFIG_DIR, CODEX_HOME), so a scratch dir is a safe trial.
//   bun tools/attach.ts share <folder>...    what an attached agent may read (nothing until you say so); unshare <folder>...; shared
// Level 1 (tools) for all three, plus a session-start Brain brief for Claude Code. Codex has no brief hook here: its hook
// format is not verified yet, so that part is reported as "not supported", never faked.
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(dirname(import.meta.dir ?? "."), "");
const MCP = join(ROOT, "tools/caesar-layer-mcp.ts"), BRIEF = join(ROOT, "tools/caesar-layer-brief.ts");
const NAME = "caesar-layer", MARK_BEGIN = "# >>> caesaros attach (caesar-layer)", MARK_END = "# <<< caesaros attach (caesar-layer)";
const HERMES_MARK_BEGIN = "# >>> caesaros attach (caesar-layer)";
const HERMES_MARK_END = "# <<< caesaros attach (caesar-layer)";
// The data folder and address of YOUR instance: from the environment, else the clean product's own defaults (never somebody else's folder).
const env = { CAESAROS_DATA: process.env.CAESAROS_DATA ?? join(homedir(), ".local/share/caesaros"), CAESAROS_URL: process.env.CAESAROS_URL ?? "http://127.0.0.1:4480" };
const claudeDir = () => process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude");
const codexDir = () => process.env.CODEX_HOME ?? join(homedir(), ".codex");
const q = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;       // a TOML basic string

export function backup(file: string, dir: string): string | null {
  if (!existsSync(file)) return null;
  const to = join(dir, "caesaros-attach-backup", `${new Date().toISOString().replace(/[:.]/g, "-")}-${file.split("/").pop()}`);
  mkdirSync(dirname(to), { recursive: true, mode: 0o700 }); copyFileSync(file, to); chmodSync(to, 0o600);       // a config can hold sign-ins: private
  const same = readdirSync(dirname(to)).filter((n) => n.endsWith("-" + (file.split("/").pop() ?? ""))).sort();
  for (const old of same.slice(0, -3)) rmSync(join(dirname(to), old), { force: true });                          // keep the last three
  return to;
}

// ---- Codex: a marked block in config.toml, so removal is exact and no TOML parser is needed ----
export const codexBlock = () => [MARK_BEGIN, `[mcp_servers.${NAME}]`, `command = "bun"`, `args = [${q(MCP)}]`, `[mcp_servers.${NAME}.env]`, ...Object.entries(env).map(([k, v]) => `${k} = ${q(v)}`), MARK_END].join("\n") + "\n";
export function codexAdd(toml: string): string { loneMarker(toml); return codexRemove(toml).replace(/\n*$/, toml.trim() ? "\n\n" : "") + codexBlock(); }
/** One marker without the other means the file was edited by hand: stop instead of writing a second, duplicate table. */
export function loneMarker(toml: string): void { if (toml.includes(MARK_BEGIN) !== toml.includes(MARK_END)) throw new Error("config.toml has one caesaros marker without the other; fix it by hand, then run again"); }
export function codexRemove(toml: string): string {
  loneMarker(toml);
  const a = toml.indexOf(MARK_BEGIN), b = toml.indexOf(MARK_END);
  if (a < 0 || b < a) return toml;
  return toml.slice(0, a).replace(/\n+$/, (m) => (a === 0 ? "" : m.length > 1 ? "\n" : m)) + toml.slice(b + MARK_END.length).replace(/^\n/, "");
}

// ---- Hermes Agent: a marked block in config.yaml. Existing user MCP entries are preserved. ----
const hermesDir = () => process.env.HERMES_HOME ?? join(homedir(), ".hermes");
const yq = (s: string) => JSON.stringify(s); // JSON double-quoted strings are valid YAML scalars.
function hermesEol(yaml: string): "\n" | "\r\n" {
  const lfOnly = yaml.replace(/\r\n/g, "");
  if (lfOnly.includes("\n") && yaml.includes("\r\n") || lfOnly.includes("\r"))
    throw new Error("config.yaml has mixed or unsupported line endings; leaving it untouched");
  return yaml.includes("\r\n") ? "\r\n" : "\n";
}
function hermesServerLines(indent: "" | "  ", config: { CAESAROS_DATA: string; CAESAROS_URL: string }): string[] {
  const child = `${indent}  `;
  return [
    `${indent}caesar-layer:`,
    `${child}command: ${yq("bun")}`,
    `${child}args: [${yq(MCP)}]`,
    `${child}env:`,
    `${child}  CAESAROS_DATA: ${yq(config.CAESAROS_DATA)}`,
    `${child}  CAESAROS_URL: ${yq(config.CAESAROS_URL)}`,
  ];
}
function hermesBlock(indent: "" | "  ", config: { CAESAROS_DATA: string; CAESAROS_URL: string }, root = false): string[] {
  const body = root ? ["mcp_servers:", ...hermesServerLines("  ", config)] : hermesServerLines(indent, config);
  const hash = createHash("sha256").update(body.join("\n")).digest("hex");
  return [`${indent}${HERMES_MARK_BEGIN} sha256=${hash}`, ...body, `${indent}${HERMES_MARK_END}`];
}
function hermesMarkerRange(lines: string[]): [number, number] | null {
  const beginMarkers = lines.flatMap((line, i) => line.trim().startsWith(HERMES_MARK_BEGIN) ? [i] : []);
  const begins = lines.flatMap((line, i) => /^# >>> caesaros attach \(caesar-layer\) sha256=([a-f0-9]{64})$/.test(line.trim()) ? [i] : []);
  const ends = lines.flatMap((line, i) => line.trim() === HERMES_MARK_END ? [i] : []);
  if (beginMarkers.length !== begins.length || begins.length !== ends.length || begins.length > 1 || (begins.length === 1 && ends[0] < begins[0]))
    throw new Error("config.yaml has invalid caesaros markers; fix it by hand, then run again");
  if (!begins.length) return null;
  const expected = lines[begins[0]].trim().match(/sha256=([a-f0-9]{64})$/)![1];
  const actual = createHash("sha256").update(lines.slice(begins[0] + 1, ends[0]).join("\n")).digest("hex");
  if (actual !== expected) throw new Error("managed Hermes MCP block changed; leaving the config untouched");
  return [begins[0], ends[0]];
}
export function hermesAdd(yaml: string, config = env): string {
  const eol = hermesEol(yaml), lines = yaml.split(/\r?\n/);
  if (lines.some((line) => line.includes("\t"))) throw new Error("config.yaml tabs are unsupported; fix indentation by hand, then run again");
  if (hermesMarkerRange(lines)) return yaml;
  const roots = lines.flatMap((line, i) => /^mcp_servers\s*:\s*(?:#.*)?$/.test(line) ? [i] : []);
  if (roots.length > 1 || lines.some((line) => /^\s+mcp_servers\s*:/.test(line)))
    throw new Error("config.yaml MCP section is ambiguous; fix it by hand, then run again");
  if (roots.length === 0) {
    if (lines.some((line) => /^\s*mcp_servers\s*:/.test(line))) throw new Error("config.yaml MCP section is unsupported");
    const block = hermesBlock("", config, true), prefix = lines.join(eol).replace(/(?:\r?\n)*$/, "");
    return `${prefix}${prefix.trim() ? eol + eol : ""}${block.join(eol)}${eol}`;
  }
  const root = roots[0]; let end = root + 1;
  while (end < lines.length && (!lines[end].trim() || lines[end].startsWith(" "))) end++;
  if (lines.slice(root + 1, end).some((line) => /^\s{2}caesar-layer\s*:/.test(line)))
    throw new Error("an unmarked caesar-layer MCP server already exists; leaving it unchanged");
  const block = hermesBlock("  ", config);
  lines.splice(end, 0, ...block);
  return lines.join(eol);
}
export function hermesRemove(yaml: string): string {
  const eol = hermesEol(yaml), lines = yaml.split(/\r?\n/), range = hermesMarkerRange(lines);
  if (!range) return yaml;
  lines.splice(range[0], range[1] - range[0] + 1);
  return lines.join(eol);
}

// ---- Claude Code: the MCP server through its own CLI (it rewrites .claude.json constantly), the hook in settings.json ----
type Settings = { hooks?: Record<string, { matcher?: string; hooks: { type: string; command: string; timeout?: number }[] }[]> } & Record<string, unknown>;
const hookCmd = () => `bun "${BRIEF}" # ${NAME}`;
export function claudeHookAdd(s: Settings): Settings {
  const out = claudeHookRemove(s); out.hooks ??= {}; (out.hooks.SessionStart ??= []).push({ matcher: "^(startup|resume|clear)$", hooks: [{ type: "command", command: hookCmd(), timeout: 10 }] }); return out;
}
export function claudeHookRemove(s: Settings): Settings {
  const out: Settings = structuredClone(s); const ss = out.hooks?.SessionStart; if (!ss) return out;
  out.hooks!.SessionStart = ss.filter((g) => !g.hooks.every((h) => h.command.endsWith(`# ${NAME}`)));
  if (!out.hooks!.SessionStart.length) delete out.hooks!.SessionStart; if (!Object.keys(out.hooks!).length) delete out.hooks; return out;
}
const claude = (args: string[]) => Bun.spawnSync(["claude", ...args], { env: process.env, stdout: "pipe", stderr: "pipe" });

const [target, ...flags] = process.argv.slice(2);
/** The owner's choice of what agents may read, kept next to the notes (layer-share.json). Folder names only, checked like note ids. */
export function shareEdit(cur: { folders: string[]; notes: string[] }, add: boolean, names: string[]): { folders: string[]; notes: string[] } {
  const ok = names.map((n) => n.replace(/^\/+|\/+$/g, "")).filter((n) => n && !n.includes("..") && !n.split("/").some((x) => x.startsWith(".")));
  const folders = add ? [...new Set([...cur.folders, ...ok])] : cur.folders.filter((f) => !ok.includes(f));
  return { folders, notes: cur.notes };
}
if (import.meta.main && ["share", "unshare", "shared"].includes(target ?? "")) {
  const file = join(env.CAESAROS_DATA, "layer-share.json");
  const cur = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : { folders: [], notes: [] };
  if (target === "shared") console.log(cur.folders.length || cur.notes.length ? `shared with agents: ${[...cur.folders.map((f: string) => f + "/"), ...cur.notes].join(", ")}` : "nothing is shared with agents");
  else {
    const names = flags.filter((f) => !f.startsWith("--"));
    if (!names.length) { console.error(`usage: bun tools/attach.ts ${target} <folder>...`); process.exit(2); }
    const next = shareEdit(cur, target === "share", names); mkdirSync(env.CAESAROS_DATA, { recursive: true }); writeFileSync(file, JSON.stringify(next, null, 1) + "\n");
    console.log(`shared with agents now: ${next.folders.length ? next.folders.map((f) => f + "/").join(", ") : "nothing"}   (${file})`);
  }
  process.exit(0);
}
if (import.meta.main) {
  const apply = flags.includes("--apply"), remove = flags.includes("--remove");
  if (!["hermes", "claude-code", "codex"].includes(target ?? "") || (apply && remove)) { console.error("usage: bun tools/attach.ts <hermes|claude-code|codex> [--apply | --remove]"); process.exit(2); }
  const say = (s: string) => console.log(s);
  const verb = remove ? "remove" : apply ? "write" : "would write (dry run, add --apply)";
  say(`CaesarOS attach: ${target}, ${remove ? "removing" : apply ? "applying" : "dry run"}`);
  if (target === "hermes") {
    const file = join(hermesDir(), "config.yaml"); const cur = existsSync(file) ? readFileSync(file, "utf8") : "";
    const next = remove ? hermesRemove(cur) : hermesAdd(cur);
    say(`- ${verb}: ${file}, a marked ${NAME} block (the CaesarOS Brain and Board tool server)`);
    if ((apply || remove) && next !== cur) { const b = backup(file, hermesDir()); mkdirSync(hermesDir(), { recursive: true }); writeFileSync(file, next); say(`- backup: ${b ?? "none (new file)"}`); }
    else if (apply || remove) say("- nothing to change");
  } else if (target === "codex") {
    const file = join(codexDir(), "config.toml"); const cur = existsSync(file) ? readFileSync(file, "utf8") : "";
    const next = remove ? codexRemove(cur) : codexAdd(cur);
    say(`- ${verb}: ${file}, a marked ${NAME} block (the CaesarOS Brain and Board tool server)`);
    say("- session-start brief: not supported for Codex yet (hook format not verified)");
    if (apply || remove) { if (next === cur) say("- nothing to change"); else { const b = backup(file, codexDir()); mkdirSync(codexDir(), { recursive: true }); writeFileSync(file, next); say(`- backup: ${b ?? "none (new file)"}`); } }
  } else {
    const file = join(claudeDir(), "settings.json"); const cur = existsSync(file) ? readFileSync(file, "utf8") : "{}";
    const s = JSON.parse(cur) as Settings; const next = JSON.stringify(remove ? claudeHookRemove(s) : claudeHookAdd(s), null, 2) + "\n";
    say(`- ${verb}: \`claude mcp ${remove ? "remove" : "add-json"} ${NAME}\` (user scope, config dir ${claudeDir()})`);
    say(`- ${verb}: ${file}, a SessionStart hook that prints a short Brain brief`);
    if (apply || remove) {
      const cj = join(claudeDir(), ".claude.json"); const bj = backup(cj, claudeDir());
      const ours = (claude(["mcp", "get", NAME]).stdout?.toString() ?? "").includes("caesar-layer-mcp.ts");       // a server of that name the owner added by hand is left alone
      if (remove && !ours) say(`- an MCP server named ${NAME} exists but is not ours (or not there): left alone`);
      const r = remove ? (ours ? claude(["mcp", "remove", NAME, "-s", "user"]) : { exitCode: 0, stderr: Buffer.from("") }) : claude(["mcp", "add-json", NAME, JSON.stringify({ type: "stdio", command: "bun", args: [MCP], env }), "-s", "user"]);
      say(r.exitCode === 0 ? `- tool server ${remove ? "removed" : "added"} (backup: ${bj ?? "none"})` : `- tool server step failed or nothing to do: ${r.stderr.toString().trim().slice(0, 160)}`);
      if (next === cur) say("- hook: nothing to change");
      else { try { const b = backup(file, claudeDir()); writeFileSync(file, next); say(`- hook ${remove ? "removed" : "written"} (backup: ${b ?? "none (new file)"})`); } catch (e) { if (!remove && r.exitCode === 0) { claude(["mcp", "remove", NAME, "-s", "user"]); say(`- hook failed (${String(e).slice(0, 100)}); the tool server was taken out again, nothing is half installed`); } else throw e; } }
    }
  }
}
