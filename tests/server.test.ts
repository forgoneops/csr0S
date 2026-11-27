// The core really runs: the Hono app answers health, settings, packs and modules with no owner layer
// present, and settings round-trip through validation.
import { beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.CAESAROS_DATA = mkdtempSync(join(tmpdir(), "caesaros-core-"));
process.env.CAESAROS_MODULE_DIRS = "plugins";   // prove it runs with the owner folder not even named

type App = { request: (path: string, init?: RequestInit) => Promise<Response> };
let app: App;

beforeAll(async () => {
  ({ app } = await import("../core/server") as unknown as { app: App });
});

describe("core server", () => {
  test("health answers without the owner layer", async () => {
    const r = await app.request("/api/health");
    expect(r.status).toBe(200);
    const body = await r.json() as { ok: boolean; name: string };
    expect(body.ok).toBe(true);
    expect(body.name).toBe("CaesarOS");
  });

  test("a fresh install has no gateway, no owner host and one local engine", async () => {
    const r = await app.request("/api/settings");
    const s = await r.json() as { gateways: unknown[]; engine: string; language: string; theme: string; brain: { location: string; url: string } };
    expect(s.gateways).toEqual([]);
    expect(s.engine).toBe("local");
    expect(s.brain).toEqual({ location: "local", url: "" });
    expect(["en", "pl"]).toContain(s.language);
    expect(s.theme).toBe("neo-roma");
    // and the engines it can chat with carry no owner product: only Ollama ships, plus tools found on this machine (Claude Code, Codex) and servers the person added
    const eng = await (await app.request("/api/engines")).json() as { engines: { id: string }[] };
    expect(eng.engines.map((e) => e.id).filter((id) => !id.startsWith("server-") && !["claude", "codex", "gemini"].includes(id))).toEqual(["ollama"]);
  });

  test("settings round-trip and reject a bad value", async () => {
    const ok = await app.request("/api/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ language: "pl", motion: "off" }) });
    expect(ok.status).toBe(200);
    expect((await ok.json() as { language: string }).language).toBe("pl");

    const bad = await app.request("/api/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ language: "de" }) });
    expect(bad.status).toBe(400);
  });

  test("packs are served with resolvable URLs", async () => {
    const r = await app.request("/api/packs");
    const p = await r.json() as { icons: { url: string }[]; themes: { id: string }[] };
    expect(p.icons[0].url.startsWith("/packs/icons/")).toBe(true);
    expect(p.themes.map((t) => t.id).sort()).toEqual(["cinder", "lumen", "neo-roma"]);
  });

  test("first run detects without writing and offers only engines that exist", async () => {
    const r = await app.request("/api/detect");
    expect(r.status).toBe(200);
    const d = await r.json() as { engines: { id: string; found: boolean; probe: { ok: boolean } }[]; modelSources: number; brain: { location: string }; gateways: unknown[] };
    expect(d.engines.map((e) => e.id)).toEqual(["hermes", "claude", "codex", "gemini", "ollama"]);
    // a tool on the PATH is not a chat source: the count follows the engines that answer, not the tools found
    const live = ((await (await app.request("/api/engines")).json()) as { engines: { health: { ok: boolean } }[] }).engines.filter((e) => e.health.ok).length;
    expect(d.modelSources).toBe(live);
    expect(d.brain.location).toBe("local");
    expect(d.gateways).toEqual([]);
  });

  test("a second detect is served from the cache at once, ?fresh=1 probes again", async () => {
    await app.request("/api/detect");
    const t = performance.now();
    const r = await app.request("/api/detect");
    expect(r.status).toBe(200);
    expect(performance.now() - t).toBeLessThan(150);
    expect((await app.request("/api/detect?fresh=1")).status).toBe(200);
  });

  test("modules answer as a list, empty or not, never as an error", async () => {
    const r = await app.request("/api/plugins/all");
    expect(r.status).toBe(200);
    expect(Array.isArray(await r.json())).toBe(true);
  });

  test("an unknown host is refused (DNS rebinding guard)", async () => {
    const r = await app.request("/api/health", { headers: { host: "evil.example.com" } });
    expect(r.status).toBe(421);
  });
});
