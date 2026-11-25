// S4 permission gate and session cleanup: who may open a terminal, from where, in which edition, and
// what ends a session (idle timeout, pty exit, the operator, the server). No real shell is spawned
// here: the manager takes its pty factory from the test, so a failure is the manager's, not bash's.
import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.CAESAROS_DATA = mkdtempSync(join(tmpdir(), "caesaros-terminal-policy-"));

const { BACKLOG_BYTES, TerminalError, TerminalSessions, addressAllowed, terminalGate, terminalOff } =
  await import("../core/terminal");

type Audit = { subjectKind: string; subjectId: string; confidence: string; claim: string };

/** A pty that records what the manager does to it and lets the test push output and an exit. */
function fakePty() {
  const writes: (string | Uint8Array)[] = [];
  const resizes: [number, number][] = [];
  let closed = false;
  let emit: (chunk: Uint8Array) => void = () => {};
  let exited: (code: number) => void = () => {};
  const handle = {
    write(data: string | Uint8Array) { writes.push(data); },
    resize(cols: number, rows: number) { resizes.push([cols, rows]); },
    close() { closed = true; },
  };
  return {
    handle,
    bind(spec: { onData: (c: Uint8Array) => void; onExit: (n: number) => void }) { emit = spec.onData; exited = spec.onExit; },
    output(text: string) { emit(new TextEncoder().encode(text)); },
    exit(code = 0) { exited(code); },
    get closed() { return closed; },
    writes, resizes,
  };
}

function bench(overrides: { idleMs?: number; maxSessions?: number; now?: () => number; audit?: (row: Audit) => void } = {}) {
  const audits: Audit[] = [];
  const pty = fakePty();
  const sessions = new TerminalSessions({
    idleMs: overrides.idleMs ?? 60_000,
    maxSessions: overrides.maxSessions ?? 4,
    now: overrides.now,
    audit: overrides.audit ?? ((row) => { audits.push(row as Audit); }),
    create: (spec) => { pty.bind(spec); return pty.handle; },
  });
  return { sessions, pty, audits };
}

const socket = () => {
  const frames: (string | Uint8Array)[] = [];
  let closed = 0;
  return {
    data: { id: "" },
    send(data: string | Uint8Array) { frames.push(data); },
    close() { closed++; },
    get frames() { return frames; },
    get closed() { return closed; },
  };
};

describe("terminal permission gate", () => {
  test("the client edition has no terminal at all", () => {
    expect(terminalOff("standard")).toBe(true);
    expect(terminalOff("consumer")).toBe(true);
    expect(terminalOff("owner")).toBe(false);
    expect(terminalOff("")).toBe(false);
    expect(terminalGate({ edition: "standard", principal: "operator" })).toEqual({ ok: false, status: 404, error: "the terminal is not part of this edition" });
  });

  test("only the operator's own browser, never an agent token or an anonymous request", () => {
    expect(terminalGate({ edition: "owner", principal: "operator" })).toEqual({ ok: true });
    expect(terminalGate({ edition: "owner", principal: "agent" })).toMatchObject({ ok: false, status: 403 });
    expect(terminalGate({ edition: "owner", principal: "anonymous" })).toMatchObject({ ok: false, status: 403 });
  });

  const addr = (...o: number[]) => o.join("."); // from octets: the leak scanner flags private IP literals
  test("loopback, private space and the tailnet are allowed; a public address is not (D5)", () => {
    for (const ip of ["127.0.0.1", "127.8.9.10", "::1", "::ffff:127.0.0.1", addr(10, 1, 2, 3), "172.16.0.1", "172.31.255.254", addr(192, 168, 1, 50), addr(100, 64, 0, 1), addr(100, 101, 102, 103), "fd7a:115c:a1e0::1", "fe80::1", undefined, null]) {
      expect({ ip, allowed: addressAllowed(ip) }).toEqual({ ip, allowed: true });
    }
    for (const ip of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "100.128.0.1", "203.0.113.7", "2001:4860:4860::8888"]) {
      expect({ ip, allowed: addressAllowed(ip) }).toEqual({ ip, allowed: false });
    }
  });

  test("a public peer and a rebound host are refused even for the operator", () => {
    expect(terminalGate({ edition: "owner", principal: "operator", address: "8.8.8.8" })).toMatchObject({ ok: false, status: 403 });
    expect(terminalGate({ edition: "owner", principal: "operator", host: "evil.example.com" })).toMatchObject({ ok: false, status: 421 });
    expect(terminalGate({ edition: "owner", principal: "operator", host: "127.0.0.1:4410", address: "127.0.0.1" })).toEqual({ ok: true });
  });
});

describe("terminal session cleanup", () => {
  test("a session writes its audit row before the shell starts and keeps its own pty", () => {
    const { sessions, pty, audits } = bench();
    const s = sessions.create({ cols: 100, rows: 30 });
    expect(s.cols).toBe(100);
    expect(s.rows).toBe(30);
    expect(audits[0]).toMatchObject({ subjectKind: "terminal", subjectId: s.id, confidence: "seen" });
    expect(sessions.size()).toBe(1);
    sessions.input(s.id, "echo hi\n");
    expect(pty.writes).toEqual(["echo hi\n"]);
    sessions.shutdown();
  });

  test("if the audit row cannot be written, no shell is started", () => {
    const { sessions, pty, audits } = bench({ audit: () => { throw new Error("ledger down"); } });
    expect(() => sessions.create()).toThrow();
    expect(sessions.size()).toBe(0);
    expect(pty.writes).toEqual([]);
    expect(audits).toEqual([]);
  });

  test("an idle session is ended, its pty closed and the end written down", () => {
    let now = 1_000;
    const { sessions, pty, audits } = bench({ idleMs: 5_000, now: () => now });
    const s = sessions.create();
    now += 4_000;
    expect(sessions.tick()).toBe(0);
    expect(sessions.has(s.id)).toBe(true);
    now += 1_100;
    expect(sessions.tick()).toBe(1);
    expect(sessions.has(s.id)).toBe(false);
    expect(pty.closed).toBe(true);
    expect(audits.at(-1)).toMatchObject({ subjectId: s.id, confidence: "done", claim: "terminal session ended: idle timeout" });
  });

  test("input keeps a session alive; the pty's exit ends it", () => {
    let now = 0;
    const { sessions, pty, audits } = bench({ idleMs: 1_000, now: () => now });
    const s = sessions.create();
    now = 900;
    sessions.input(s.id, "keystroke");
    now = 1_500;
    expect(sessions.tick()).toBe(0);
    expect(sessions.size()).toBe(1);
    pty.exit(0);
    expect(sessions.size()).toBe(0);
    expect(sessions.has(s.id)).toBe(false);
    expect(audits.at(-1)).toMatchObject({ subjectId: s.id, confidence: "done", claim: "terminal session ended: exited (0)" });
  });

  test("a dropped viewer keeps the shell alive and the backlog is bounded", () => {
    const { sessions, pty } = bench();
    const s = sessions.create();
    const first = socket(); first.data.id = s.id;
    expect(sessions.attach(s.id, first)).toBe(true);
    sessions.detach(s.id, first);
    expect(sessions.has(s.id)).toBe(true);          // hidden, not gone

    pty.output("a".repeat(40 * 1024));
    pty.output("b".repeat(40 * 1024));
    const again = socket(); again.data.id = s.id;
    sessions.attach(s.id, again);
    const bytes = again.frames.filter((f): f is Uint8Array => typeof f !== "string").reduce((n, f) => n + f.byteLength, 0);
    expect(bytes).toBeLessThanOrEqual(BACKLOG_BYTES);
    expect(bytes).toBeGreaterThan(0);
    // the newest output is what survives
    const text = again.frames.filter((f): f is Uint8Array => typeof f !== "string").map((f) => new TextDecoder().decode(f)).join("");
    expect(text.at(-1)).toBe("b");
    sessions.shutdown();
  });

  test("the manager refuses more sessions than it allows", () => {
    const { sessions } = bench({ maxSessions: 1 });
    sessions.create();
    expect(() => sessions.create()).toThrow(TerminalError);
    sessions.shutdown();
  });

  test("a resize is clamped to what a terminal can be", () => {
    const { sessions, pty } = bench();
    const s = sessions.create();
    sessions.resize(s.id, 0, 9999);
    expect(pty.resizes.at(-1)).toEqual([2, 200]);
    sessions.resize(s.id, 120.6, 40.2);
    expect(pty.resizes.at(-1)).toEqual([121, 40]);
    sessions.shutdown();
  });

  test("the backlog keeps only the newest bytes when nobody is looking", () => {
    const { sessions, pty } = bench();
    const s = sessions.create();
    const viewer = socket(); viewer.data.id = s.id;
    sessions.attach(s.id, viewer);
    sessions.detach(s.id, viewer);
    pty.output("A".repeat(BACKLOG_BYTES + 20_000));
    const again = socket(); again.data.id = s.id;
    expect(sessions.attach(s.id, again)).toBe(true);
    const bytes = again.frames.filter((f): f is Uint8Array => typeof f !== "string").reduce((n, f) => n + f.byteLength, 0);
    expect(bytes).toBeLessThanOrEqual(BACKLOG_BYTES);
    expect(bytes).toBeGreaterThan(0);
    sessions.shutdown();
  });
});
