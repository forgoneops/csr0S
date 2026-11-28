// Computer control for this Wayland/Hyprland machine: see the screen, list/focus windows, type and
// press keys into ONE named window. A one-shot run does not inherit the session variables, so every call
// sets XDG_RUNTIME_DIR, WAYLAND_DISPLAY and HYPRLAND_INSTANCE_SIGNATURE itself, discovered at call time.
// Safety is the feature: nothing runs unless armed (short TTL), typing only lands in a window we focus and
// re-check, secret-looking prompts are refused, and every call is one line in the instance's computer-audit.jsonl.
// Pointer clicks are out of scope: uinput is root-only (plan 3.4d).
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Context, Hono } from "hono";
import { DATA } from "./db";
import { ROOT } from "./root";
import { isLocal } from "./webgate";
import { isolated } from "./host";

export type SessionEnv = { XDG_RUNTIME_DIR: string; WAYLAND_DISPLAY: string; HYPRLAND_INSTANCE_SIGNATURE: string };
export type ExecResult = { code: number; out: string; err: string };
export type Exec = (file: string, args: string[], env: Record<string, string>, signal?: AbortSignal) => Promise<ExecResult>;
export type Win = { address: string; class: string; title: string; pid: number; x: number; y: number; width: number; height: number; workspace: string };
export type Region = { x: number; y: number; width: number; height: number };
export type AuditEntry = { time: string; action: string; class: string | null; title: string | null; result: string; length: number | null };

/** Hyprland 0.56 dispatches are Lua: hl.dsp.focus({window="address:0x…"}); the old "focuswindow address:…" is rejected. */
export const focusDispatch = (address: string) => `hl.dsp.focus({window="address:${address}"})`;

export class ComputerError extends Error {
  constructor(readonly code: "not_armed" | "focus_failed" | "secret_field" | "bad_request" | "too_long" | "unsupported", message: string = code) { super(message); }
}

// ---- session discovery (pure: takes a directory listing function so a test needs no display)
export function discoverSession(runtimeDir: string, ls: (d: string) => string[] = (d) => readdirSync(d)): SessionEnv {
  const wayland = ls(runtimeDir).find((n) => /^wayland-\d+$/.test(n));
  if (!wayland) throw new Error(`no Wayland socket in ${runtimeDir}`);
  const sig = ls(join(runtimeDir, "hypr")).find((n) => !n.startsWith("."));
  if (!sig) throw new Error(`no Hyprland instance in ${runtimeDir}/hypr`);
  return { XDG_RUNTIME_DIR: runtimeDir, WAYLAND_DISPLAY: wayland, HYPRLAND_INSTANCE_SIGNATURE: sig };
}

// ---- a prompt that may be asking for a secret gets no keystrokes
const SECRET = /password|passphrase|sudo|1password|bitwarden|keepassxc|polkit|gpg|pinentry|login/i;
export const looksLikeSecret = (w: { class?: string; title?: string }) => SECRET.test(`${w.class ?? ""} ${w.title ?? ""}`);

// ---- armed state: default off, expires on its own, never longer than 15 minutes
export function createArmed(now: () => number = Date.now) {
  let until = 0;
  return {
    arm(on: boolean, ttlSeconds?: number) {
      if (!on) { until = 0; return 0; }
      const ttl = ttlSeconds ?? 300;
      if (!Number.isFinite(ttl) || ttl <= 0 || ttl > 900) throw new ComputerError("bad_request", "ttlSeconds must be 1..900");
      until = now() + Math.floor(ttl) * 1000;
      return until;
    },
    isArmed: () => now() < until,
    disarm: () => { until = 0; },
    until: () => until,
  };
}

// ---- audit: one JSON line per call, never the text, never image bytes
export function auditLine(e: Omit<AuditEntry, "time">, now = Date.now): AuditEntry { return { time: new Date(now()).toISOString(), ...e }; }
export function appendAudit(dir: string, e: AuditEntry) { mkdirSync(dir, { recursive: true }); appendFileSync(join(dir, "computer-audit.jsonl"), JSON.stringify(e) + "\n"); }
export function readAudit(dir: string, limit = 100): AuditEntry[] {
  try {
    const lines = readFileSync(join(dir, "computer-audit.jsonl"), "utf8").trim().split("\n").filter(Boolean);
    return lines.slice(-limit).flatMap((l) => { try { return [JSON.parse(l) as AuditEntry]; } catch { return []; } });
  } catch { return []; }
}

// ---- key combos: "ctrl+shift+t" -> wtype args
const MODS: Record<string, string> = { ctrl: "ctrl", control: "ctrl", alt: "alt", shift: "shift", super: "logo", logo: "logo", meta: "logo", win: "logo", cmd: "logo" };
const KEYSYMS = new Set(["Return", "Escape", "Tab", "space", "BackSpace", "Delete", "Up", "Down", "Left", "Right", "Home", "End", "Page_Up", "Page_Down", "minus", "equal", "plus", "comma", "period", "slash", "semicolon", "apostrophe", "bracketleft", "bracketright", "backslash", "grave"]);
export function parseCombo(combo: string): { mods: string[]; key: string } {
  const parts = combo.split("+").map((p) => p.trim()).filter(Boolean);
  const key = parts.pop() ?? "";
  const mods = parts.map((p) => MODS[p.toLowerCase()]);
  if (!key || mods.some((m) => !m)) throw new ComputerError("bad_request", `unknown key in "${combo}"`);
  if (!KEYSYMS.has(key) && !/^[A-Za-z0-9]$/.test(key) && !/^F([1-9]|1[0-9]|2[0-4])$/.test(key)) throw new ComputerError("bad_request", `unknown key "${key}"`);
  return { mods, key };
}
export function comboArgs(combo: string): string[] {
  const { mods, key } = parseCombo(combo);
  return [...mods.flatMap((m) => ["-M", m]), "-k", key, ...[...mods].reverse().flatMap((m) => ["-m", m])];
}

// ---- PNG size from the IHDR header (screenshots are downscaled by grim's -s factor)
export function pngSize(b: Uint8Array): { width: number; height: number } {
  if (b.length < 24 || b[0] !== 0x89 || b[1] !== 0x50 || b[2] !== 0x4e || b[3] !== 0x47) throw new Error("grim did not return a PNG");
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { width: v.getUint32(16), height: v.getUint32(20) };
}

export const spawnExec: Exec = async (file, args, env, signal) => {
  if (isolated()) return { code: 1, out: "", err: "not available in a throwaway copy" };
  const p = Bun.spawn([file, ...args], { env: { ...process.env, ...env }, stdout: "pipe", stderr: "pipe" });
  const abort = () => p.kill();
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const [out, err] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
    return { code: await p.exited, out, err };
  } finally { signal?.removeEventListener("abort", abort); }
};

const dataDir = () => DATA;   // the instance's data folder, never the repo
const ADDRESS = /^0x[0-9a-f]+$/i;

export function createComputer(opts: { exec?: Exec; env?: () => SessionEnv; data?: () => string; now?: () => number } = {}) {
  const run = opts.exec ?? spawnExec, env = opts.env ?? (() => discoverSession(`/run/user/${process.getuid?.() ?? 1000}`)), now = opts.now ?? Date.now;
  const armed = createArmed(now), data = opts.data ?? dataDir;
  let typing: AbortController | null = null;

  const hypr = async (...args: string[]) => {
    const r = await run("hyprctl", args, env() as unknown as Record<string, string>);
    if (r.code !== 0) throw new Error(`hyprctl ${args[0]}: ${r.err.trim() || `exit ${r.code}`}`);
    return r.out;
  };
  const clients = async (): Promise<Win[]> => {
    const rows = JSON.parse((await hypr("clients", "-j")) || "[]") as Array<Record<string, never>>;
    return rows.map((w: Record<string, any>) => ({ address: w.address, class: w.class ?? "", title: w.title ?? "", pid: w.pid ?? 0, x: w.at?.[0] ?? 0, y: w.at?.[1] ?? 0, width: w.size?.[0] ?? 0, height: w.size?.[1] ?? 0, workspace: w.workspace?.name ?? "" }));
  };
  const active = async (): Promise<Win | null> => {
    const w = JSON.parse((await hypr("activewindow", "-j")) || "{}") as Record<string, any>;
    return w?.address ? { address: w.address, class: w.class ?? "", title: w.title ?? "", pid: w.pid ?? 0, x: w.at?.[0] ?? 0, y: w.at?.[1] ?? 0, width: w.size?.[0] ?? 0, height: w.size?.[1] ?? 0, workspace: w.workspace?.name ?? "" } : null;
  };
  const find = async (address: string) => {
    if (!ADDRESS.test(address)) throw new ComputerError("bad_request", "a window address like 0x55… is required");
    const w = (await clients()).find((x) => x.address.toLowerCase() === address.toLowerCase());
    if (!w) throw new ComputerError("bad_request", "no window with that address");
    return w;
  };
  const audit = (action: string, result: string, w?: { class?: string; title?: string } | null, length: number | null = null) =>
    appendAudit(data(), auditLine({ action, class: w?.class ?? null, title: w?.title ?? null, result, length }, now));

  const needArmed = () => { if (!armed.isArmed()) { audit("refused", "not_armed"); throw new ComputerError("not_armed"); } };
  // Every action goes through here: armed first, then focus the exact address and prove it is active.
  const aimed = async (action: string, address: string) => {
    needArmed();
    const target = await find(address).catch(() => { audit(action, "focus_failed"); throw new ComputerError("focus_failed"); });
    await hypr("dispatch", focusDispatch(target.address));
    const after = await active();
    if (after?.address.toLowerCase() !== target.address.toLowerCase()) { audit(action, "focus_failed", target); throw new ComputerError("focus_failed"); }
    if (looksLikeSecret(target)) { audit(action, "secret_field", target); throw new ComputerError("secret_field"); }
    return target;
  };

  return {
    isArmed: () => armed.isArmed(),
    until: () => armed.until(),
    arm: (on: boolean, ttlSeconds?: number) => { const t = armed.arm(on, ttlSeconds); audit(on ? "arm" : "disarm", "ok"); return t; },
    stop: () => { typing?.abort(); typing = null; armed.disarm(); audit("stop", "ok"); },
    listWindows: async () => { needArmed(); const w = await clients(); audit("list", "ok"); return w; },
    activeWindow: async () => { needArmed(); const w = await active(); audit("active", "ok", w); return w; },
    cursor: async () => {
      needArmed();
      const m = /(-?\d+)\s*,\s*(-?\d+)/.exec(await hypr("cursorpos"));
      if (!m) throw new Error("hyprctl cursorpos: unexpected output");
      audit("cursor", "ok");
      return { x: Number(m[1]), y: Number(m[2]) };
    },
    focus: async (address: string) => { const w = await aimed("focus", address); audit("focus", "ok", w); return w; },
    typeInto: async (address: string, text: string) => {
      needArmed();
      if (typeof text !== "string" || !text) throw new ComputerError("bad_request", "text is required");
      if (text.length > 2000) throw new ComputerError("too_long", "at most 2000 characters per call");
      const w = await aimed("type", address);
      const ctl = new AbortController(); typing = ctl;
      try {
        const r = await run("wtype", ["--", text], env() as unknown as Record<string, string>, ctl.signal);
        if (r.code !== 0) { audit("type", "failed", w, text.length); throw new Error(`wtype: ${r.err.trim() || `exit ${r.code}`}`); }
        audit("type", "ok", w, text.length);
        return { typed: text.length, class: w.class, title: w.title };
      } finally { if (typing === ctl) typing = null; }
    },
    keys: async (address: string, combo: string) => {
      needArmed();
      const args = comboArgs(combo);   // validate before touching anything
      const w = await aimed("keys", address);
      const ctl = new AbortController(); typing = ctl;
      try {
        const r = await run("wtype", args, env() as unknown as Record<string, string>, ctl.signal);
        if (r.code !== 0) { audit("keys", "failed", w); throw new Error(`wtype: ${r.err.trim() || `exit ${r.code}`}`); }
        audit("keys", "ok", w);
        return { keys: combo, class: w.class, title: w.title };
      } finally { if (typing === ctl) typing = null; }
    },
    screenshot: async (o: { window?: string; region?: Region } = {}) => {
      needArmed();
      let area: Region;
      if (o.window) { const w = await find(o.window); area = { x: w.x, y: w.y, width: w.width, height: w.height }; }
      else if (o.region) { const r = o.region; if (![r.x, r.y, r.width, r.height].every(Number.isFinite) || r.width <= 0 || r.height <= 0) throw new ComputerError("bad_request", "a region is x, y, width, height"); area = r; }
      else throw new ComputerError("bad_request", "give a window address or a region");
      const shot = async (scale?: number) => {
        const file = join(tmpdir(), `caesar-shot-${crypto.randomUUID()}.png`);
        const r = await run("grim", ["-g", `${area.x},${area.y} ${area.width}x${area.height}`, ...(scale ? ["-s", String(scale)] : []), file], env() as unknown as Record<string, string>);
        if (r.code !== 0) throw new Error(`grim: ${r.err.trim() || `exit ${r.code}`}`);
        try { const bytes = new Uint8Array(readFileSync(file)); return { bytes, ...pngSize(bytes) }; } finally { try { unlinkSync(file); } catch { /* already gone */ } }
      };
      let png = await shot();
      const longest = Math.max(png.width, png.height);
      if (longest > 1920) {   // grim's -s is absolute against the logical geometry, so derive the used scale from the first shot
        const used = area.width > 0 ? png.width / area.width : 1;
        png = await shot((1920 / longest) * used);
        if (Math.max(png.width, png.height) > 1920) throw new Error("screenshot is still wider than 1920 after scaling");
      }
      audit("screenshot", "ok", o.window ? await find(o.window).catch(() => null) : null);
      return png;
    },
  };
}
export type Computer = ReturnType<typeof createComputer>;

// ---- routes: loopback + operator only; one stream here, one instance below (the armed state is in memory)

/** `agent` says whether the caller is an agent holding a token scoped "computer". Agents may use the action calls, and only while a
 *  person has armed it; arming, stopping, reading the audit and issuing the token stay with the person. */
export function computerApi(app: Hono, isOperator: (c: Context) => boolean, comp: Computer = createComputer(), agent: (c: Context) => boolean = () => false, issueToken?: () => string) {
  const gate = (c: Context, agentOk: boolean) => {
    if (!isLocal(c)) return c.json({ error: "computer control is loopback only" }, 403);
    if (isOperator(c)) return null;
    if (agentOk && agent(c)) return null;
    return c.json({ error: agentOk ? "operator or a computer token only" : "operator only" }, 403);
  };
  const fail = (c: Context, e: unknown) => {
    if (!(e instanceof ComputerError)) return c.json({ error: (e as Error).message }, 500);
    const status = e.code === "bad_request" || e.code === "too_long" ? 400 : 409;
    return c.json({ error: e.code }, status);
  };
  const body = async (c: Context) => await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const wrap = (fn: (c: Context) => Promise<Response>, agentOk = false) => async (c: Context) => {
    const refused = gate(c, agentOk); if (refused) return refused;
    try { return await fn(c); } catch (e) { return fail(c, e); }
  };

  app.post("/api/computer/arm", wrap(async (c) => {
    const b = await body(c); if (typeof b.on !== "boolean") return c.json({ error: "on must be true or false" }, 400);
    return c.json({ armed: b.on, until: comp.arm(b.on, b.ttlSeconds as number | undefined) });
  }));
  // The person hands an agent a token for this feature only. It does nothing unless the person also arms the feature.
  app.post("/api/computer/token", wrap(async (c) => (issueToken ? (issueToken(), c.json({ ok: true, file: "computer-token", days: 7 })) : c.json({ error: "not available" }, 501))));
  app.get("/api/computer/state", wrap(async (c) => c.json({
    armed: comp.isArmed(), until: comp.until(), hasToken: existsSync(join(DATA, "computer-token")),
    mcpScript: join(ROOT, "tools", "caesar-computer-mcp.ts"), dataDir: DATA, pointer: false,
  })));
  app.post("/api/computer/stop", wrap(async (c) => { comp.stop(); return c.json({ armed: false }); }));
  app.get("/api/computer/windows", wrap(async (c) => c.json(await comp.listWindows()), true));
  app.get("/api/computer/active", wrap(async (c) => c.json(await comp.activeWindow()), true));
  app.get("/api/computer/cursor", wrap(async (c) => c.json(await comp.cursor()), true));
  app.get("/api/computer/audit", wrap(async (c) => c.json(readAudit(DATA))));
  app.post("/api/computer/focus", wrap(async (c) => { const b = await body(c); return c.json(await comp.focus(String(b.address ?? ""))); }, true));
  app.post("/api/computer/type", wrap(async (c) => { const b = await body(c); return c.json(await comp.typeInto(String(b.address ?? ""), String(b.text ?? ""))); }, true));
  app.post("/api/computer/keys", wrap(async (c) => { const b = await body(c); return c.json(await comp.keys(String(b.address ?? ""), String(b.combo ?? ""))); }, true));
  app.post("/api/computer/screenshot", wrap(async (c) => {
    const b = await body(c);
    const png = await comp.screenshot({ window: b.window ? String(b.window) : undefined, region: b.region as Region | undefined });
    return c.body(png.bytes as unknown as ArrayBuffer, 200, { "Content-Type": "image/png" });
  }, true));
  app.post("/api/computer/click", wrap(async () => new Response(JSON.stringify({ error: "pointer injection needs uinput access; see plan 3.4d" }), { status: 501, headers: { "Content-Type": "application/json" } })));
}
