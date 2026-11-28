// A throwaway copy shows nothing of the computer it runs on; a real install still finds the person's own agents.
import { expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { isolated } from "../core/host";

const put = (file: string, text: string) => { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, text); };
const skill = (name: string) => `---\nname: ${name}\ndescription: ${name} description\n---\nbody of ${name}`;
const MARK = "zzinvented";   // every invented name carries it

function fakeHome(): string {
  const home = mkdtempSync(join(tmpdir(), "fake-home-"));
  for (const [dir, name] of [[".hermes", "hermes"], [".claude", "claude"], [".agents", "codex"]]) put(join(home, dir!, "skills", "kit", `${MARK}-${name}`, "SKILL.md"), skill(`${MARK}-${name}-skill`));
  put(join(home, ".hermes", "profiles", `${MARK}-member`, "config.yaml"), `model:\n  default: ${MARK}-model\n`);
  put(join(home, ".hermes", "config.yaml"), `model:\n  default: ${MARK}-default-model\n  provider: ${MARK}-provider\n`);
  put(join(home, ".local", "state", "omarchy", "agents", "usage", "claude.json"), JSON.stringify({ updatedAt: new Date().toISOString(), limits: [{ label: "weekly", percent: 37 }] }));
  put(join(home, ".local", "share", "caesaros-speech", "tts", "venv", "bin", "python"), "");
  const voices = join(home, ".local", "share", "caesaros-speech", "tts", "voices");
  put(join(voices, `en_US-${MARK}-medium.onnx`), "x"); put(join(voices, `en_US-${MARK}-medium.onnx.json`), "{}");
  const bin = join(home, ".local", "bin", "hermes");
  put(bin, `#!/bin/sh\necho '[{"id":"1","title":"${MARK}-task","status":"todo"}]'\n`); chmodSync(bin, 0o755);
  return home;
}

const ROUTES = ["/api/skills", `/api/skills/body?id=kit/${MARK}-hermes`, "/api/crew", "/api/crew/retired", "/api/chat-targets", "/api/engines", "/api/orchestration",
  "/api/mirror", "/api/mirror/kanban", "/api/mirror/curator", "/api/hermes/config", "/api/hardware", "/api/admin", "/api/usage/limits", "/api/pairing", "/api/webgate",
  "/api/expose", "/api/hud/window", "/api/computer/state", "/api/tts/status", "/api/transcribe/status", "/api/image", "/api/storage", "/api/models/installed",
  "/api/models/info", "/api/install-gate", "/api/get-started", "/api/p/fleet/self", "/api/detect"];

async function boot(home: string, extra: Record<string, string>) {
  const port = await new Promise<number>((done) => { const s = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response() }); const p = s.port!; s.stop(true); done(p); });
  const env = { PATH: `${join(home, ".local", "bin")}:${dirname(process.execPath)}:/usr/bin:/bin`, HOME: home, TMPDIR: tmpdir(), CAESAROS_DATA: mkdtempSync(join(tmpdir(), "fresh-data-")), CAESAROS_PORT: String(port), CAESAROS_HOST: "127.0.0.1", CAESAROS_MODULE_DIRS: "plugins", ...extra };
  const proc = Bun.spawn([process.execPath, "core/server.ts", "--dev"], { cwd: join(import.meta.dir, ".."), env, stdin: "ignore", stdout: "ignore", stderr: "ignore" });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 150; i++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { await Bun.sleep(100); } }
  const get = async (path: string) => { const r = await fetch(base + path, { headers: { "sec-fetch-site": "same-origin" } });   // the owner's own browser
    return { status: r.status, text: await r.text() }; };
  const on = (id: string) => fetch(`${base}/api/plugins/${id}/enabled`, { method: "PUT", headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" }, body: JSON.stringify({ enabled: true }) });
  return { get, on, stop: async () => { proc.kill(); await proc.exited; } };
}

test("a fresh throwaway data folder shows none of this computer's names through the API", async () => {
  const core = await boot(fakeHome(), {});
  try {
    expect((await core.on("fleet")).ok).toBe(true);
    const seen = new Map<string, { status: number; text: string }>();
    for (const path of ROUTES) seen.set(path, await core.get(path));
    for (const [path, r] of seen) {
      expect([path, r.status < 500]).toEqual([path, true]);
      expect([path, r.text.includes(MARK) && !path.includes(MARK) ? r.text.slice(Math.max(0, r.text.indexOf(MARK) - 300), r.text.indexOf(MARK) + 80) : ""]).toEqual([path, ""]);
      if (hostname().length > 3) expect([path, r.text.includes(`"${hostname()}"`)]).toEqual([path, false]);
    }
    const json = (p: string) => { expect([p, seen.get(p)!.status]).toEqual([p, 200]); return JSON.parse(seen.get(p)!.text); };
    expect(seen.get(`/api/skills/body?id=kit/${MARK}-hermes`)!.status).toBe(404);
    expect(json("/api/crew")).toEqual([]);
    expect(json("/api/mirror/kanban")).toEqual([]);
    expect(json("/api/hardware")).toEqual({ machine: null, advice: [], hidden: true });
    expect(json("/api/admin")).toEqual({ disks: [], machine: null, hidden: true });
    expect(json("/api/p/fleet/self")).toEqual({ version: expect.any(String) });
    expect(json("/api/pairing").name).toBe("CaesarOS");
    expect(json("/api/webgate").address).toEqual({ lan: null, tailnet: null });
    expect(json("/api/usage/limits").every((t: { state: string }) => t.state === "none")).toBe(true);
    expect(json("/api/models/installed")).toEqual([]);
  } finally { await core.stop(); }
}, 60_000);

test("the same home is found by a real install, and explicit overrides work in a throwaway one", async () => {
  const home = fakeHome();
  const normal = await boot(home, { CAESAROS_ISOLATED: "0" });
  try {
    const skills = (await normal.get("/api/skills")).text;
    for (const n of ["hermes", "claude", "codex"]) expect(skills).toContain(`${MARK}-${n}-skill`);
    expect((await normal.get("/api/crew")).text).toContain(`${MARK}-member`);
    expect((await normal.get("/api/tts/status")).text).toContain(MARK);
  } finally { await normal.stop(); }
  const pointed = await boot(home, { HERMES_HOME: join(home, ".hermes") });
  try {
    expect((await pointed.get("/api/crew")).text).toContain(`${MARK}-member`);
    expect((await pointed.get("/api/skills")).text).toContain(`${MARK}-hermes-skill`);
    expect((await pointed.get("/api/skills")).text).not.toContain(`${MARK}-claude-skill`);
    expect((await pointed.get("/api/mirror/kanban")).text).toContain(`${MARK}-task`);
  } finally { await pointed.stop(); }
}, 60_000);

test("no launcher's data folder is taken for a throwaway one", () => {
  const home = "/home/someone", on = (CAESAROS_DATA?: string, temp = "/tmp", h = home) => isolated({ CAESAROS_DATA }, h, temp);
  // unset (from source or the compiled default), the desktop shell and run-desktop, both run-instance copies, a folder of their own choice
  for (const d of [undefined, `${home}/.local/share/caesaros`, `${home}/.local/share/caesaros-clean`, `${home}/.local/share/caesaros-mine`, "/srv/caesaros", `${home}/Documents/caesaros`]) expect([d, on(d)]).toEqual([d, false]);
  expect(on(`${home}/work/data`, home)).toBe(false);            // TMPDIR=$HOME proves nothing
  expect(on("/tmp/h/.local/share/caesaros", "/tmp", "/tmp/h")).toBe(false);   // a container whose home is under /tmp
  expect(on("/tmp/demo")).toBe(true);
  expect(on(`${home}/.cache/run/data`, `${home}/.cache/run`)).toBe(true);   // inside a private TMPDIR
  expect(on("/tmpfoo/data")).toBe(false);
  expect(on("/var/cache/t/data", "/var/cache/t", "/var/cache/t/fake-home")).toBe(true);   // a made-up HOME beside the data, both in TMPDIR
  expect(on("/srv/caesaros", "/")).toBe(false);
  expect(isolated({ CAESAROS_DATA: "/tmp/demo", CAESAROS_ISOLATED: "0" }, home, "/tmp")).toBe(false);
  expect(isolated({ CAESAROS_ISOLATED: "1" }, home, "/tmp")).toBe(true);
});
