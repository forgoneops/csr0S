// The Hermes configuration reader and its route (plan 7.8/7.9, "Hermes configuration page", first slice, read-only).
// The reader shows only what is safe: provider, model, base URL host, where it runs, effort, delegation, fallback,
// plugins and toolsets. A key, token or password is never returned, not even masked, whatever its shape.
import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gatewayPort, hermesConfApi, parseHermesVersion, readHermesConf } from "../core/hermesconf";

const KEY = "sk-test-abcdefgh1234";   // key-shaped on purpose, under the leak check's 20-character rule
const YAML = `model:
  provider: ollama
  default: llama3:8b
  base_url: http://127.0.0.1:11434/v1
agent:
  reasoning_effort: high
delegation:
  provider: nous
  model: hermes-4-70b
fallback_model:
  provider: openrouter
  model: some/model
plugins:
  enabled:
    - omh
    - hermes-reading
platform_toolsets:
  cli:
    - web
    - terminal
providers:
  nous:
    api_key: ${KEY}
model_api_key: ${KEY}
`;

describe("readHermesConf", () => {
  test("a local provider on a private address is local, and only the host of the URL is shown", () => {
    const c = readHermesConf("caesar", YAML);
    expect(c.profile).toBe("caesar");
    expect(c.provider).toBe("ollama");
    expect(c.model).toBe("llama3:8b");
    expect(c.baseUrlHost).toBe("127.0.0.1");
    expect(c.scope).toBe("local");
    expect(c.reasoningEffort).toBe("high");
    expect(c.delegation).toEqual({ provider: "nous", model: "hermes-4-70b" });
    expect(c.fallback).toEqual({ provider: "openrouter", model: "some/model" });
    expect(c.plugins).toEqual(["omh", "hermes-reading"]);
    expect(c.toolsets).toEqual(["web", "terminal"]);
  });

  test("a cloud provider counts as cloud even with a private address elsewhere", () => {
    const c = readHermesConf("caesar", "model:\n  provider: nous\n  default: x\n  base_url: https://api.example.com/v1\n");
    expect(c.scope).toBe("cloud");
    expect(c.baseUrlHost).toBe("api.example.com");
  });

  test("a URL with credentials returns its host and never the user, password or full URL", () => {
    const c = readHermesConf("me", "model:\n  provider: ollama\n  default: x\n  base_url: https://user:hunter2@example.com/v1\n");
    expect(c.baseUrlHost).toBe("example.com");
    expect(JSON.stringify(c)).not.toContain("hunter2");
    expect(JSON.stringify(c)).not.toContain("user:");
  });

  test("no secret is ever returned, not even masked", () => {
    const out = JSON.stringify(readHermesConf("caesar", YAML));
    expect(out).not.toContain("sk-");
    expect(out).not.toContain(KEY);
    expect(out).not.toContain("api_key");
  });

  test("a key written into a shown field is dropped and reported as not read", () => {
    const c = readHermesConf("x", `model:\n  provider: ollama\n  default: ${KEY}\n`);
    expect(c.model).toBeNull();
    expect(c.notRead).toContain("model");
  });

  test("odd YAML returns what parses, says not read for the rest, and does not throw", () => {
    const c = readHermesConf("x", "model:\n  provider: 'unclosed\n\tbad: [\nplugins:\n  enabled: notalist\n");
    expect(c.provider).toBe("'unclosed");
    expect(c.model).toBeNull();
    expect(c.notRead).toContain("model");
    expect(c.plugins).toEqual([]);
    const empty = readHermesConf("x", "just a line without a colon\n");
    expect(empty.notRead).toContain("model");
    expect(empty.scope).toBe("cloud");
  });
});

describe("parseHermesVersion", () => {
  test("the gateway port comes from the config, else Hermes' own default", () => {
    expect(gatewayPort("gateway:\n  api_server:\n    port: 9001\n")).toBe(9001);
    expect(gatewayPort("model:\n  provider: nous\n")).toBe(8642);
    expect(gatewayPort("gateway:\n  api_server:\n    port: nonsense\n")).toBe(8642);
  });
  test("reads the version and the install method from the tool's own output", () => {
    const v = parseHermesVersion("Hermes Agent v0.23.3 (2026.9.24) · stable\nInstall method: git\nPython: 3.14.9");
    expect(v.version).toBe("0.23.3");
    expect(v.installMethod).toBe("git");
  });
  test("an unreadable output says nothing rather than guessing", () => {
    expect(parseHermesVersion("")).toEqual({ version: null, installMethod: null });
  });
});

describe("GET /api/hermes/config", () => {
  const dir = mkdtempSync(join(tmpdir(), "caesaros-hconf-"));
  writeFileSync(join(dir, "config.yaml"), YAML);
  mkdirSync(join(dir, "profiles", "caesar"), { recursive: true });
  writeFileSync(join(dir, "profiles", "caesar", "config.yaml"), YAML);

  const run = async () => ({ code: 0, out: "Hermes Agent v0.23.3 (2026.9.24) · stable\nInstall method: git\n", err: "" });
  const app = (operator: boolean, probe: () => Promise<boolean> = async () => true) => {
    const a = new Hono();
    hermesConfApi(a, () => operator, { dir, run, hermesPath: "/usr/local/bin/hermes", probeGateway: probe });
    return a;
  };

  test("the operator sees the default profile and each profile, sanitized", async () => {
    const r = await app(true).request("/api/hermes/config");
    expect(r.status).toBe(200);
    const text = await r.text();
    expect(text).not.toContain(KEY);
    const j = JSON.parse(text) as { profiles: { profile: string; scope: string }[]; hermes: { version: string | null; installMethod: string | null; gateway: boolean } };
    expect(j.profiles.map((p) => p.profile)).toEqual(["default", "caesar"]);
    expect(j.profiles.every((p) => p.scope === "local")).toBe(true);
    expect(j.hermes).toEqual({ version: "0.23.3", installMethod: "git", gateway: true });
  });

  test("anyone else is refused", async () => {
    expect((await app(false).request("/api/hermes/config")).status).toBe(403);
  });

  test("a gateway that does not answer is reported as such", async () => {
    const j = await (await app(true, async () => false).request("/api/hermes/config")).json() as { hermes: { gateway: boolean } };
    expect(j.hermes.gateway).toBe(false);
  });

  test("a missing config is reported as not read, not invented", async () => {
    const empty = mkdtempSync(join(tmpdir(), "caesaros-hconf-empty-"));
    const a = new Hono();
    hermesConfApi(a, () => true, { dir: empty, run, hermesPath: "/usr/local/bin/hermes" });
    const j = await (await a.request("/api/hermes/config")).json() as { profiles: { profile: string; notRead: string[] }[] };
    expect(j.profiles).toHaveLength(1);
    expect(j.profiles[0].notRead).toContain("model");
  });
});
