// The `/` menu of the chat. Hermes registers about a hundred slash commands; only the read-only ones that answer in a single turn are
// offered here (usage, who am I, version, help, status...). Anything that changes Hermes' own settings, restarts it, or works on a
// session that CaesarOS does not hold (/yolo, /update, /restart, /new, /undo...) stays in Hermes' terminal. The list is a snapshot of
// Hermes' own registry (tools/dump-hermes-commands.ts), so a command is never invented here. The shell adds its own (/local, /cloud).
import type { Context, Hono } from "hono";
import snapshot from "./hermes-commands.json";

export const SAFE = ["help", "commands", "usage", "whoami", "version", "status", "context", "insights", "topup"] as const;       // /model and /profile change Hermes with an argument, so they stay in its terminal
export type MenuCommand = { name: string; description: string; args: string; kind: "hermes" };

export const menuCommands = (src: { commands: { name: string; description: string; args: string; cli_only?: boolean }[] } = snapshot): MenuCommand[] =>
  SAFE.flatMap((n) => { const c = src.commands.find((x) => x.name === n && !x.cli_only); return c ? [{ name: `/${c.name}`, description: c.description, args: c.args, kind: "hermes" as const }] : []; });

export function commandsApi(app: Hono, isOperator: (c: Context) => boolean = () => true): void {
  app.get("/api/chat/commands", (c) => (isOperator(c) ? c.json({ hermes: snapshot.hermes, commands: menuCommands() }) : c.json({ error: "operator_only" }, 403)));
}
