// Claude Bridge: several Claude Code accounts, one taking over from another at a usage limit.
//   GET    /accounts                 every account with its state (signed in, windows, closed until) and the one that takes the next turn
//   POST   /accounts                 { label, configDir } add an account by hand (the folder is created if needed)
//   PATCH  /accounts/:id             { label?, enabled? }
//   DELETE /accounts/:id             remove an added account (the main one stays)
//   POST   /accounts/:id/check       sign-in state, and one tiny Haiku question to read the account's windows
//   POST   /accounts/:id/prepare     link skills, CLAUDE.md, settings, plugins and projects from the main account (never the login)
//   PUT    /mode                     { mode: "failover" | "balance" }
//   GET    /pick                     the account for a turn started outside CAESAR (the `cc` helper): its config folder
// The agents plugin asks this one through the `claudeAccounts` capability; nothing imports across plugins.
import { homedir } from "node:os";
import { join } from "node:path";
import type { PluginContext } from "../../core/plugins";
import { Settings } from "../../core/schema";
import { accountName } from "../../core/tool-names";
import { kv } from "../../core/db";
import { provide, type ClaudeWindows } from "../../core/capabilities";
import { prepareConfigDir, validateConfigDir } from "./accounts";
import { choose, closedUntil, type Account, type Mode, type State } from "./pick";

const MAIN = "main";
const mainDir = () => process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");

export default function (ctx: PluginContext) {
  const naming = () => Settings.parse(kv("core").get("settings", {}));
  type Stored = { id: string; label: string; configDir: string; enabled: boolean };
  const added = () => ctx.store.get<Stored[]>("accounts", []);
  const mainMeta = () => ctx.store.get<{ label: string; enabled: boolean }>("main", { label: accountName("claude", 1, naming()), enabled: true });
  const states = () => ctx.store.get<Record<string, State & { subscription?: string; checkedAt?: number }>>("state", {});
  const setState = (id: string, patch: Partial<State & { subscription?: string; checkedAt?: number }>) => ctx.store.set("state", { ...states(), [id]: { ...states()[id], ...patch } });
  const mode = (): Mode => (ctx.store.get<string>("mode", "failover") === "balance" ? "balance" : "failover");
  const accounts = (): Account[] => [{ id: MAIN, label: mainMeta().label, configDir: mainDir(), enabled: mainMeta().enabled }, ...added()];
  const envOf = (a: Account): Record<string, string> => (a.id === MAIN ? {} : { CLAUDE_CONFIG_DIR: a.configDir });

  const pickNow = () => { const c = choose(accounts(), states(), Date.now(), mode()); const a = c && accounts().find((x) => x.id === c.id); return c && a ? { ...c, account: a } : null; };

  provide("claudeAccounts", {
    pick() { const p = pickNow(); return p ? { id: p.id, label: p.account.label, env: envOf(p.account), reason: p.reason, allLimited: p.allLimited } : null; },
    report(id, windows: ClaudeWindows) {
      const now = Date.now(), open = !Object.values(windows).some((w) => w.status === "rejected" || w.used >= 0.995);
      setState(id, { windows, windowsAt: now, ...(open ? { limitedUntil: 0 } : {}) });
    },
    limited(id, until) { setState(id, { limitedUntil: until ?? Date.now() + 30 * 60_000 }); ctx.publish("limited", { id, until }); },   // when the reset is unknown, try again in half an hour
    alternative(excludeId) {
      const rest = accounts().filter((a) => a.id !== excludeId && a.enabled);
      const c = choose(rest, states(), Date.now(), mode());
      const a = c && !c.allLimited ? rest.find((x) => x.id === c.id) : undefined;
      return a ? { id: a.id, label: a.label, env: envOf(a) } : null;
    },
  });

  const run = async (cmd: string[], env: Record<string, string>, ms = 25_000) => {
    const bin = Bun.which("claude"); if (!bin) throw new Error("Claude Code is not installed on this machine.");
    const p = Bun.spawn([bin, ...cmd], { stdout: "pipe", stderr: "pipe", stdin: "ignore", env: { ...process.env, ...env, RUST_LOG: "error" } });
    const timer = setTimeout(() => p.kill(), ms);
    const out = await new Response(p.stdout).text(); await p.exited; clearTimeout(timer); return out;
  };
  async function signIn(a: Account) {
    try { const j = JSON.parse(await run(["auth", "status"], envOf(a), 15_000)); setState(a.id, { loggedIn: !!j.loggedIn, subscription: j.subscriptionType, checkedAt: Date.now() }); return !!j.loggedIn; }
    catch { setState(a.id, { loggedIn: false, checkedAt: Date.now() }); return false; }
  }
  /** One tiny Haiku question on this account, only to read the windows Claude Code reports. */
  async function probe(a: Account) {
    const out = await run(["-p", "Reply with: ok", "--model", "haiku", "--output-format", "stream-json", "--verbose"], envOf(a), 60_000);
    for (const line of out.split("\n")) {
      if (!line.startsWith("{")) continue;
      try { const m = JSON.parse(line); if (m.type === "rate_limit_event" && m.rate_limit_info) {
        const w = m.rate_limit_info.unifiedWindows ?? {};
        const windows: ClaudeWindows = Object.fromEntries(Object.entries(w).map(([k, v]: [string, any]) => [k, { used: Number(v.utilization ?? 0), resetsAt: v.resetsAt ? v.resetsAt * 1000 : null, status: v.status }]));
        setState(a.id, { windows, windowsAt: Date.now() }); return windows;
      } } catch { /* skip a malformed line */ }
    }
    return null;
  }

  const view = () => {
    const now = Date.now(), st = states(), p = pickNow();
    return { mode: mode(), next: p ? { id: p.id, reason: p.reason, allLimited: p.allLimited } : null,
      accounts: accounts().map((a, i) => ({ ...a, main: a.id === MAIN, order: i, state: { ...st[a.id], closedUntil: closedUntil(st[a.id], now) } })) };
  };
  const find = (id: string) => accounts().find((a) => a.id === id);

  ctx.routes.get("/accounts", (c) => c.json(view()));
  ctx.routes.post("/accounts", async (c) => {
    const b = await c.req.json().catch(() => ({})) as { label?: string; configDir?: string };
    try {
      const dir = validateConfigDir(String(b.configDir ?? ""), homedir(), accounts().map((a) => a.configDir));
      const label = String(b.label ?? "").trim().slice(0, 40) || accountName("claude", accounts().length + 1, naming());
      const id = `acct-${Date.now().toString(36)}`;
      ctx.store.set("accounts", [...added(), { id, label, configDir: dir, enabled: true }]);
      return c.json(view());
    } catch (e) { return c.json({ error: (e as Error).message }, 400); }
  });
  ctx.routes.patch("/accounts/:id", async (c) => {
    const id = c.req.param("id"), b = await c.req.json().catch(() => ({})) as { label?: string; enabled?: boolean };
    if (!find(id)) return c.json({ error: "no such account" }, 404);
    const label = typeof b.label === "string" ? b.label.trim().slice(0, 40) : undefined;
    if (id === MAIN) ctx.store.set("main", { ...mainMeta(), ...(label ? { label } : {}), ...(typeof b.enabled === "boolean" ? { enabled: b.enabled } : {}) });
    else ctx.store.set("accounts", added().map((a) => (a.id === id ? { ...a, ...(label ? { label } : {}), ...(typeof b.enabled === "boolean" ? { enabled: b.enabled } : {}) } : a)));
    return c.json(view());
  });
  ctx.routes.delete("/accounts/:id", (c) => {
    const id = c.req.param("id"); if (id === MAIN) return c.json({ error: "the main account cannot be removed" }, 400);
    ctx.store.set("accounts", added().filter((a) => a.id !== id)); const s = states(); delete s[id]; ctx.store.set("state", s);
    return c.json(view());   // only the entry goes; the folder and its login are left as they are
  });
  ctx.routes.post("/accounts/:id/check", async (c) => {
    const a = find(c.req.param("id")); if (!a) return c.json({ error: "no such account" }, 404);
    try { const ok = await signIn(a); if (ok) await probe(a); return c.json(view()); } catch (e) { return c.json({ error: (e as Error).message }, 500); }
  });
  ctx.routes.post("/accounts/:id/prepare", (c) => {
    const a = find(c.req.param("id")); if (!a) return c.json({ error: "no such account" }, 404);
    if (a.id === MAIN) return c.json({ error: "this is the main account" }, 400);
    try { return c.json({ ...prepareConfigDir(mainDir(), a.configDir), ...view() }); } catch (e) { return c.json({ error: (e as Error).message }, 400); }
  });
  ctx.routes.put("/mode", async (c) => {
    const b = await c.req.json().catch(() => ({})) as { mode?: string };
    if (b.mode !== "failover" && b.mode !== "balance") return c.json({ error: "mode is failover or balance" }, 400);
    ctx.store.set("mode", b.mode); return c.json(view());
  });
  ctx.routes.get("/pick", (c) => { const p = pickNow(); return c.json(p ? { id: p.id, label: p.account.label, configDir: p.id === MAIN ? "" : p.account.configDir, reason: p.reason, allLimited: p.allLimited } : { error: "no account is enabled" }); });
}
