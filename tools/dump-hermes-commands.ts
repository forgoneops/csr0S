#!/usr/bin/env bun
// Writes core/hermes-commands.json: the slash commands Hermes itself registers (name, description, arguments, category), read from the
// installed Hermes. Run it again after every Hermes update. Needs an installed Hermes; nothing is sent anywhere.
import { readdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const home = process.env.HERMES_HOME ?? join(homedir(), ".hermes");
const install = Bun.spawnSync(["hermes", "--version"], { stdout: "pipe", stderr: "ignore" }).stdout.toString();
const dir = /Install directory: (\S+)/.exec(install)?.[1], version = /Hermes Agent (v[\d.]+)/.exec(install)?.[1] ?? "unknown";
if (!dir) { console.error("no Hermes install found (hermes --version did not say where it is)"); process.exit(1); }
const envs = join(home, "installs");
const pythons: string[] = [];
for (const a of readdirSync(envs)) for (const b of (() => { try { return readdirSync(join(envs, a, "environments")); } catch { return []; } })()) pythons.push(join(envs, a, "environments", b, "venv", "bin", "python"));
pythons.sort((x, y) => { try { return statSync(y).mtimeMs - statSync(x).mtimeMs; } catch { return 0; } });
const code = `import json
from hermes_cli.commands import COMMAND_REGISTRY as R
print(json.dumps([{"name": c.name, "description": c.description, "args": c.args_hint or "", "category": c.category, "cli_only": bool(c.cli_only), "gateway_only": bool(c.gateway_only), "aliases": list(c.aliases)} for c in R]))`;
for (const py of pythons) {
  const r = Bun.spawnSync([py, "-c", code], { cwd: dir, stdout: "pipe", stderr: "ignore" });
  if (r.exitCode !== 0) continue;
  const list = JSON.parse(r.stdout.toString().trim().split("\n").pop() ?? "[]");
  writeFileSync(join(import.meta.dir, "..", "core", "hermes-commands.json"), JSON.stringify({ hermes: version, commands: list }, null, 1) + "\n");
  console.log(`${list.length} commands from Hermes ${version}`); process.exit(0);
}
console.error("could not read the Hermes command registry"); process.exit(1);
