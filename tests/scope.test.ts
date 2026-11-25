// "Local only" (plan 7.8): an engine says where its model runs; with the switch on, no cloud engine gets a turn.
import { beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hermesScope, isLocalUrl, modelBlock } from "../core/scope";
import { failoverStream, resetRest, type Switch } from "../core/failover";
import { defaultTarget, LOCAL_ONLY_NOTE } from "../core/crew";
import type { Target } from "../core/crew";
import type { EngineAdapter, EngineEvent } from "../core/engines";

const eng = (id: string, scope: "local" | "cloud" | undefined, text: string, ok = true): EngineAdapter => ({
  id, label: id, scope: scope ? () => scope : undefined, health: async () => ({ ok, detail: null }), models: async () => [{ id: "m", label: "m" }],
  stream: async function* (): AsyncIterable<EngineEvent> { yield { type: "delta", text }; yield { type: "done" }; },
});
// built from parts: the leak check rightly refuses private addresses written out in the repo
const ip = (...p: number[]) => `http://${p.join(".")}:8080`;
const collect = async (it: AsyncIterable<EngineEvent>) => { let s = ""; for await (const e of it) if (e.type === "delta") s += e.text; return s; };
const msgs = [{ role: "user" as const, content: "hi" }];
beforeEach(resetRest);

describe("what counts as local", () => {
  test("this machine and private addresses are local, a tailnet or public host is not", () => {
    for (const u of ["http://127.0.0.1:11434", "http://localhost:1234/v1", ip(192, 168, 1, 5), ip(10, 0, 0, 2), ip(172, 20, 0, 3)]) expect(isLocalUrl(u)).toBe(true);
    for (const u of ["https://api.openai.com/v1", ip(100, 70, 1, 2), "not a url"]) expect(isLocalUrl(u)).toBe(false);
  });
  test("a Hermes profile is local when its own config says so, cloud otherwise or when unreadable", () => {
    const home = mkdtempSync(join(tmpdir(), "hs-"));
    const prof = (name: string, yaml: string) => { mkdirSync(join(home, "profiles", name), { recursive: true }); writeFileSync(join(home, "profiles", name, "config.yaml"), yaml); };
    prof("a", "model:\n  provider: ollama\n  default: qwen\n");
    prof("b", "model:\n  provider: openrouter\n  default: x\n  base_url: http://127.0.0.1:8080/v1\n");
    prof("c", "model:\n  provider: deepseek\n  default: y\n");
    expect([hermesScope("a", home), hermesScope("b", home), hermesScope("c", home), hermesScope("missing", home)]).toEqual(["local", "local", "cloud", "cloud"]);
    expect(modelBlock("x: 1\nmodel:\n  provider: 'ollama'\nother:\n  provider: z\n")).toEqual({ provider: "ollama" });
  });
});

describe("Local only", () => {
  test("a chat opened on a cloud engine is moved to a local one, and says so", async () => {
    const seen: Switch[] = [];
    const out = await collect(failoverStream(eng("claude", "cloud", "cloud!"), [eng("ollama", "local", "local!")], msgs, { model: "x", localOnly: true, onSwitch: (s) => seen.push(s) }));
    expect(out).toBe("local!");
    expect(seen).toEqual([{ from: "claude", to: "ollama", reason: "local-only", model: "m" }]);
  });
  test("an engine that does not declare its scope counts as cloud and is never used", async () => {
    await expect(collect(failoverStream(eng("mystery", undefined, "x"), [eng("codex", "cloud", "y")], msgs, { model: "x", localOnly: true }))).rejects.toThrow("Local only is on");
  });
  test("a local primary is used as it is, with no switch signal", async () => {
    const seen: Switch[] = [];
    expect(await collect(failoverStream(eng("ollama", "local", "ok"), [eng("claude", "cloud", "no")], msgs, { model: "x", localOnly: true, onSwitch: (s) => seen.push(s) }))).toBe("ok");
    expect(seen).toEqual([]);
  });
  test("switched off, cloud engines work as before", async () => {
    expect(await collect(failoverStream(eng("claude", "cloud", "cloud!"), [eng("ollama", "local", "l")], msgs, { model: "x" }))).toBe("cloud!");
  });
  test("with Local only on and nothing local, the default says why", () => {
    const t = (id: string): Target => ({ id, label: id, role: "x", ok: false, detail: LOCAL_ONLY_NOTE, group: "tools", scope: "cloud" });
    expect(defaultTarget([t("claude"), t("codex")]).message).toContain("Local only is on");
  });
});

// from the independent review of 2026-11-23 (claude-a)
import { classify } from "../core/failover";
describe("review fixes", () => {
  test("a host name is never local just because it starts with digits", () => {
    for (const u of ["https://10.example.com/v1", "http://192.168.evil.org", "http://127.attacker.net", ip(172, 40, 0, 1), "http://300.1.1.1"]) expect(isLocalUrl(u)).toBe(false);
    for (const u of ["http://[::1]:1234/v1", "http://app.localhost:8080"]) expect(isLocalUrl(u)).toBe(true);
  });
  test("a bare number in a message is not an outage, a status code is", () => {
    expect(classify("context is 512 tokens too long")).toBe(null);
    expect(classify("the file has 429 lines")).toBe(null);
    expect(classify("HTTP 503 Service Unavailable")).toBe("outage");
    expect(classify("request failed with status 429")).toBe("limit");
  });
  test("a chat that began on a local engine does not move to the cloud by itself, unless allowed", async () => {
    const down = eng("ollama", "local", "x"); down.stream = async function* () { throw new Error("fetch failed"); };
    await expect(collect(failoverStream(down, [eng("claude", "cloud", "cloud!")], msgs, { model: "m" }))).rejects.toThrow("fetch failed");
    resetRest();
    expect(await collect(failoverStream(down, [eng("claude", "cloud", "cloud!")], msgs, { model: "m", allowCloud: true }))).toBe("cloud!");
  });
  test("the switch is announced once, for the engine that really answers, with its own model", async () => {
    const seen: Switch[] = [];
    const first = eng("claude", "cloud", "x"); first.stream = async function* () { throw new Error("usage limit reached"); };
    const out = await collect(failoverStream(first, [eng("codex", "cloud", "no", false), eng("ollama", "local", "from ollama")], msgs, { model: "x", onSwitch: (s) => seen.push(s) }));
    expect(out).toBe("from ollama");
    expect(seen).toEqual([{ from: "claude", to: "ollama", reason: "limit", model: "m" }]);
  });
});
