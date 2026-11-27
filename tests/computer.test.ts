// Computer control: the pure parts (session discovery, secret matcher, armed TTL, audit shape) and the
// refusals (not armed, focus did not land) against a mocked command runner. No display is required.
import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { Hono } from "hono";
import {
  appendAudit, auditLine, comboArgs, computerApi, createArmed, createComputer, discoverSession,
  looksLikeSecret, parseCombo, pngSize, readAudit, type Exec, type ExecResult, ComputerError,
} from "../core/computer";

const tmp = () => mkdtempSync(join(process.env.TMPDIR ?? "/tmp", "caesar-computer-"));
const win = (address = "0xabc123", extra: Record<string, unknown> = {}) => ({ address, class: "foot", title: "scratch", pid: 7, at: [10, 20], size: [400, 300], workspace: { name: "1" }, ...extra });

test("session environment is discovered from the runtime directory, never hard-coded", () => {
  const tree: Record<string, string[]> = { "/run/user/1000": ["bus", "wayland-1", "wayland-1.lock", "hypr"], "/run/user/1000/hypr": ["sig123_1_2"] };
  const env = discoverSession("/run/user/1000", (d) => tree[d] ?? []);
  expect(env).toEqual({ XDG_RUNTIME_DIR: "/run/user/1000", WAYLAND_DISPLAY: "wayland-1", HYPRLAND_INSTANCE_SIGNATURE: "sig123_1_2" });
  expect(() => discoverSession("/run/user/9", (d) => tree[d] ?? [])).toThrow(/no Wayland socket/);
  expect(() => discoverSession("/run/user/1000", (d) => d === "/run/user/1000" ? ["wayland-2"] : [])).toThrow(/no Hyprland instance/);
});

test("a title or class that looks like a secret prompt is refused", () => {
  for (const t of ["Password", "sudo: terminal", "login at host", "Unlock Bitwarden", "GPG key", "pinentry-gtk", "polkit authentication", "KeePassXC", "1Password"]) expect(looksLikeSecret({ class: "foot", title: t })).toBe(true);
  expect(looksLikeSecret({ class: "1password", title: "x" })).toBe(true);
  expect(looksLikeSecret({ class: "foot", title: "caesar-scratch — vim" })).toBe(false);
});

test("armed is off by default, expires on its own, and never exceeds 900 seconds", () => {
  let t = 1_000_000;
  const a = createArmed(() => t);
  expect(a.isArmed()).toBe(false);
  a.arm(true, 10); expect(a.isArmed()).toBe(true);
  t += 9_999; expect(a.isArmed()).toBe(true);
  t += 1; expect(a.isArmed()).toBe(false);
  expect(() => a.arm(true, 901)).toThrow(ComputerError);
  expect(() => a.arm(true, 0)).toThrow();
  a.arm(true); expect(a.until()).toBe(t + 300_000);   // default five minutes
  a.arm(false); expect(a.isArmed()).toBe(false);
});

test("audit lines carry the shape, never the typed text, and reads return the last 100", () => {
  const dir = tmp();
  try {
    const line = auditLine({ action: "type", class: "foot", title: "scratch", result: "ok", length: 12 }, () => 1_700_000_000_000);
    expect(line).toEqual({ time: "2023-11-14T22:13:20.000Z", action: "type", class: "foot", title: "scratch", result: "ok", length: 12 });
    for (let i = 0; i < 120; i++) appendAudit(dir, auditLine({ action: "cursor", class: null, title: null, result: "ok", length: null }, () => 1_700_000_000_000 + i));
    const last = readAudit(dir);
    expect(last).toHaveLength(100);
    expect(last[0].time).toBe(new Date(1_700_000_000_020).toISOString());
    expect(JSON.stringify(readAudit(dir, 1))).not.toContain("text");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("key combos become wtype arguments and unknown keys are refused", () => {
  expect(comboArgs("Return")).toEqual(["-k", "Return"]);
  expect(comboArgs("ctrl+shift+t")).toEqual(["-M", "ctrl", "-M", "shift", "-k", "t", "-m", "shift", "-m", "ctrl"]);
  expect(comboArgs("super+Return")).toEqual(["-M", "logo", "-k", "Return", "-m", "logo"]);
  expect(() => parseCombo("ctrl+NotAKey")).toThrow(/unknown key/);
  expect(() => parseCombo("hyper+t")).toThrow(/unknown key/);
});

test("pngSize reads the IHDR header and refuses anything that is not a PNG", () => {
  const png = new Uint8Array(24); png.set([0x89, 0x50, 0x4e, 0x47]);
  new DataView(png.buffer).setUint32(16, 800); new DataView(png.buffer).setUint32(20, 600);
  expect(pngSize(png)).toEqual({ width: 800, height: 600 });
  expect(() => pngSize(new Uint8Array(24))).toThrow(/not return a PNG/);
});

const fakeExec = (active: string, calls: string[][] = []): Exec => async (file, args): Promise<ExecResult> => {
  calls.push([file, ...args]);
  if (file === "hyprctl" && args[0] === "clients") return { code: 0, out: JSON.stringify([win(), win("0xdef456", { class: "off-grid-ai", title: "Off Grid" })]), err: "" };
  if (file === "hyprctl" && args[0] === "activewindow") return { code: 0, out: JSON.stringify(win(active)), err: "" };
  if (file === "hyprctl" && args[0] === "dispatch") return { code: 0, out: "ok", err: "" };
  return { code: 0, out: "", err: "" };
};

test("typing into an address whose focus did not land is refused and nothing is typed", async () => {
  const calls: string[][] = [], dir = tmp();
  try {
    const c = createComputer({ exec: fakeExec("0xdef456", calls), env: () => ({ XDG_RUNTIME_DIR: "x", WAYLAND_DISPLAY: "wayland-1", HYPRLAND_INSTANCE_SIGNATURE: "s" }), data: () => dir });
    c.arm(true, 60);
    await expect(c.typeInto("0xabc123", "echo hi")).rejects.toMatchObject({ code: "focus_failed" });
    expect(calls.some(([f]) => f === "wtype")).toBe(false);
    expect(calls.find(([f, a]) => f === "hyprctl" && a === "dispatch")?.[2]).toBe('hl.dsp.focus({window="address:0xabc123"})');
    await expect(c.typeInto("0xdeadbeef", "x")).rejects.toMatchObject({ code: "focus_failed" });   // an address that is not a window is a focus failure too
    expect(readAudit(dir).filter((l) => l.result === "focus_failed")).toHaveLength(2);
    expect(readAudit(dir).find((l) => l.result === "focus_failed")).toMatchObject({ action: "type", class: "foot", title: "scratch" });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("every action is off until armed, and a failed type is one audited line with the length only", async () => {
  const dir = tmp(), calls: string[][] = [];
  try {
    const c = createComputer({ exec: fakeExec("0xabc123", calls), env: () => ({ XDG_RUNTIME_DIR: "x", WAYLAND_DISPLAY: "wayland-1", HYPRLAND_INSTANCE_SIGNATURE: "s" }), data: () => dir });
    await expect(c.typeInto("0xabc123", "secret text")).rejects.toMatchObject({ code: "not_armed" });
    await expect(c.listWindows()).rejects.toMatchObject({ code: "not_armed" });
    expect(calls).toHaveLength(0);
    c.arm(true, 30);
    c.stop();
    await expect(c.keys("0xabc123", "Return")).rejects.toMatchObject({ code: "not_armed" });
    c.arm(true, 30);
    await c.typeInto("0xabc123", "echo caesar-computer-ok");
    const lines = readAudit(dir);
    const typed = lines.find((l) => l.action === "type");
    expect(typed).toMatchObject({ class: "foot", title: "scratch", result: "ok", length: 23 });
    expect(JSON.stringify(lines)).not.toContain("echo caesar-computer-ok");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("routes: loopback and operator only, then 409 not_armed", async () => {
  const app = new Hono(), dir = tmp();
  const c = createComputer({ exec: fakeExec("0xabc123"), env: () => ({ XDG_RUNTIME_DIR: "x", WAYLAND_DISPLAY: "wayland-1", HYPRLAND_INSTANCE_SIGNATURE: "s" }), data: () => dir });
  computerApi(app, (ctx) => ctx.req.header("x-operator") === "yes", c);
  const get = (headers: Record<string, string> = {}, ip = "127.0.0.1") =>
    app.fetch(new Request("http://127.0.0.1:4400/api/computer/windows", { headers }), { server: { requestIP: () => ({ address: ip }) } });   // the env shape core/server.ts passes
  expect((await get({ "x-operator": "yes" }, "203.0.113.7")).status).toBe(403);
  expect((await get()).status).toBe(403);
  const armed = await get({ "x-operator": "yes" });
  expect(armed.status).toBe(409);
  expect(await armed.json()).toEqual({ error: "not_armed" });
  expect((await get({ "x-operator": "yes", "x-forwarded-for": "203.0.113.7" })).status).toBe(403);   // forwarded by a proxy on this machine
  rmSync(dir, { recursive: true, force: true });
});
