import { beforeEach, describe, expect, test } from "bun:test";
import { classify, failoverStream, order, resetRest, restingUntil } from "../core/failover";
import type { EngineAdapter, EngineEvent } from "../core/engines";

const eng = (id: string, run: () => AsyncIterable<EngineEvent>, ok = true, vision = false): EngineAdapter => ({
  id, label: id, vision, health: async () => ({ ok, detail: null }), models: async () => [{ id: "m-" + id, label: id }], stream: run,
});
const says = (t: string) => async function* (): AsyncIterable<EngineEvent> { yield { type: "delta", text: t }; yield { type: "done" }; };
const fails = (msg: string, after = false) => async function* (): AsyncIterable<EngineEvent> { if (after) yield { type: "delta", text: "partial" }; throw new Error(msg); };
const collect = async (it: AsyncIterable<EngineEvent>) => { const out: string[] = []; for await (const e of it) if (e.type === "delta") out.push(e.text); return out.join(""); };
const msgs = [{ role: "user" as const, content: "hi" }];

beforeEach(resetRest);

describe("classify", () => {
  test("limits, sign-in problems and outages are told apart; other failures are not engine problems", () => {
    expect(classify("Claude Code exited 1: You've hit your usage limit")).toBe("limit");
    expect(classify("HTTP 429 Too Many Requests")).toBe("limit");
    expect(classify("installed, sign in: claude login")).toBe("auth");
    expect(classify("fetch failed")).toBe("outage");
    expect(classify("the model refused this request")).toBe(null);
  });
});

describe("failoverStream", () => {
  test("a limit before any output hands the turn to the next engine in the fixed order and rests the failed one", async () => {
    const seen: string[] = [];
    const a = eng("hermes:caesar", fails("usage limit reached"));
    const out = await collect(failoverStream(eng("claude", fails("rate limit")), [a, eng("codex", says("from codex")), eng("ollama", says("from ollama"))], msgs, { model: "x", onSwitch: (s) => seen.push(`${s.from}>${s.to}:${s.reason}`) }));
    expect(out).toBe("from codex");
    expect(seen).toEqual(["claude>hermes:caesar:limit", "hermes:caesar>codex:limit"]);
    expect(restingUntil("claude")?.reason).toBe("limit");
  });
  test("a failure after output has started is never switched", async () => {
    await expect(collect(failoverStream(eng("claude", fails("rate limit", true)), [eng("codex", says("x"))], msgs, { model: "x" }))).rejects.toThrow("rate limit");
  });
  test("a failure that is not an engine problem is raised, not hidden by another engine", async () => {
    await expect(collect(failoverStream(eng("claude", fails("bad request")), [eng("codex", says("x"))], msgs, { model: "x" }))).rejects.toThrow("bad request");
  });
  test("a resting or unhealthy engine is skipped, and with none left the first error comes out", async () => {
    const out = await collect(failoverStream(eng("claude", fails("fetch failed")), [eng("codex", says("c"), false), eng("ollama", says("o"))], msgs, { model: "x" }));
    expect(out).toBe("o");
    resetRest();
    await expect(collect(failoverStream(eng("claude", fails("fetch failed")), [eng("codex", says("c"), false)], msgs, { model: "x" }))).rejects.toThrow("fetch failed");
  });
  test("rest times end: after the window the engine is used again", async () => {
    let t = 0; const now = () => t;
    await collect(failoverStream(eng("claude", fails("fetch failed")), [eng("ollama", says("o"))], msgs, { model: "x", now }));
    expect(restingUntil("claude", 1_000)).not.toBe(null);
    expect(restingUntil("claude", 3 * 60_000)).toBe(null);
  });
  test("images only go to engines that can take them", async () => {
    const withImg = [{ role: "user" as const, content: "see", images: [{ mime: "image/png", data: "x" }] }];
    await expect(collect(failoverStream(eng("claude", fails("fetch failed"), true, true), [eng("ollama", says("o"))], withImg, { model: "x" }))).rejects.toThrow("fetch failed");
  });
  test("the fixed order", () => {
    expect(order([eng("ollama", says("")), eng("hermes:vitruvius", says("")), eng("codex", says("")), eng("hermes:caesar", says("")), eng("claude", says(""))]).map((e) => e.id)).toEqual(["hermes:caesar", "hermes:vitruvius", "claude", "codex", "ollama"]);
  });
});
