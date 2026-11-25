// Terminal session recovery. Close can be undone for 10 seconds (the shell keeps running, hidden);
// the last 2000 lines are saved every 30 seconds and come back dimmed after a restart.
import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.CAESAROS_DATA = mkdtempSync(join(tmpdir(), "caesaros-terminal-rec-"));
const { TerminalSessions } = await import("../core/terminal");

function bench(o: { now?: () => number; dir?: string } = {}) {
  let emit: (c: Uint8Array) => void = () => {}; let closed = false; const writes: (string | Uint8Array)[] = [];
  const audits: { claim: string }[] = []; const dir = o.dir ?? mkdtempSync(join(tmpdir(), "term-hist-"));
  const sessions = new TerminalSessions({ idleMs: 3_600_000, parkMs: 10_000, dir, now: o.now, audit: (r) => { audits.push(r as never); },
    create: (spec) => { emit = spec.onData; return { write: (d) => { writes.push(d); }, resize() {}, close() { closed = true; } }; } });
  return { sessions, dir, audits, writes, out: (t: string) => emit(new TextEncoder().encode(t)), get closed() { return closed; } };
}
const socket = () => { const got: (string | Uint8Array)[] = []; return { got, data: { id: "" }, send: (d: string | Uint8Array) => { got.push(d); }, close() {} }; };
const text = (got: (string | Uint8Array)[]) => got.map((g) => typeof g === "string" ? "" : new TextDecoder().decode(g)).join("");

describe("undo a close", () => {
  test("a parked shell keeps running, hidden; restoring within 10 s brings it back", () => {
    let t = 1_000; const b = bench({ now: () => t }), { id } = b.sessions.create();
    expect(b.sessions.park(id)).toBe(true);
    expect(b.sessions.list()[0]).toMatchObject({ parked: true, attached: false }); expect(b.closed).toBe(false);
    expect(b.sessions.input(id, "x")).toBe(false);                      // hidden: no typing into it
    t += 9_000; expect(b.sessions.restore(id)).toBe(true); expect(b.sessions.list()[0]!.parked).toBe(false); expect(b.sessions.input(id, "x")).toBe(true);
  });
  test("after 10 s the shell really ends, once, and the ledger says who closed it", () => {
    let t = 1_000; const b = bench({ now: () => t }), { id } = b.sessions.create();
    b.sessions.park(id); t += 10_001;
    expect(b.sessions.tick()).toBe(1); expect(b.closed).toBe(true); expect(b.sessions.has(id)).toBe(false);
    expect(b.sessions.restore(id)).toBe(false);
    expect(b.audits.some((a) => a.claim.includes("ended: closed by the operator"))).toBe(true);
  });
});

describe("history", () => {
  test("the last 2000 lines are kept and saved to a private file; nothing is saved for a session with no output", () => {
    const b = bench(), { id } = b.sessions.create(); b.sessions.saveHistory();
    expect(readdirSync(b.dir)).toEqual([]);
    b.out(Array.from({ length: 2500 }, (_, i) => `line ${i}`).join("\r\n") + "\r\nprompt$ ");
    b.sessions.saveHistory();
    const f = join(b.dir, `${id}.json`); expect(existsSync(f)).toBe(true); expect(statSync(f).mode & 0o777).toBe(0o600);
    const saved = JSON.parse(require("node:fs").readFileSync(f, "utf8")) as { text: string };
    expect(saved.text.startsWith("line 500")).toBe(true); expect(saved.text.endsWith("prompt$ ")).toBe(true); expect(saved.text.split("\n").length).toBeLessThanOrEqual(2001);
  });
  test("after a restart the old session is offered, comes back dimmed in a new shell, and its file is removed", () => {
    const first = bench(), { id } = first.sessions.create(); first.out("echo hi\r\nhi\r\n"); first.sessions.saveHistory(); first.sessions.shutdown();
    expect(existsSync(join(first.dir, `${id}.json`))).toBe(true);            // a stopped server keeps it
    const second = bench({ dir: first.dir });
    expect(second.sessions.recoverable().map((r) => r.id)).toEqual([id]);
    const fresh = second.sessions.create({ recover: id }), s = socket(); second.sessions.attach(fresh.id, s as never);
    const shown = text(s.got); expect(shown).toContain("echo hi"); expect(shown).toContain("\x1b[2m"); expect(shown).toContain("restored");
    expect(existsSync(join(first.dir, `${id}.json`))).toBe(false); expect(second.sessions.recoverable()).toEqual([]);
    expect(second.sessions.create({ recover: "../../etc/passwd" }).id).toBeTruthy();   // a bad id is ignored, a plain shell starts
  });
  test("ending a shell on purpose forgets its history", () => {
    const b = bench(), { id } = b.sessions.create(); b.out("secret\r\n"); b.sessions.saveHistory();
    b.sessions.close(id, "closed by the operator"); expect(existsSync(join(b.dir, `${id}.json`))).toBe(false);
  });
});
