import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getKey, hasKey, removeKey, saveKey } from "../../core/service-keys";
import { decide, JevError, underCap } from "./jev";
const ok = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
test("decide returns answers and the cost, computed from tokens when the service gives none", async () => {
  const d = await decide("k", "text", { t: { type: "choice", criteria: { a: "x", b: "y" } } }, ok({ answers: { t: { choice: "a", confidence: 0.9 } }, usage: { input_tokens: 1_000_000 } }));
  expect(d.answers.t.choice).toBe("a"); expect(d.cost).toBeCloseTo(0.042);
});
test("a refused key and a bad answer are plain errors", async () => {
  await expect(decide("k", "t", {}, ok({}, 401))).rejects.toThrow("refused");
  await expect(decide("k", "t", {}, ok({ nope: 1 }))).rejects.toThrow(JevError);
});
test("the daily cap", () => { expect(underCap(0.4, 0.5)).toBe(true); expect(underCap(0.5, 0.5)).toBe(false); });
test("keys are stored apart, never invented", () => {
  const root = mkdtempSync(join(tmpdir(), "keys-"));
  expect(hasKey(root, "jev")).toBe(false); expect(getKey(root, "jev")).toBeNull();
  expect(() => saveKey(root, "jev", "short")).toThrow(); saveKey(root, "jev", "sk-test-12345678");
  expect(getKey(root, "jev")).toBe("sk-test-12345678"); removeKey(root, "jev"); expect(hasKey(root, "jev")).toBe(false);
});
import { syncHermesEnv } from "../../core/service-keys";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
test("the Jev key is mirrored into Hermes profile .env files and removed again, other lines untouched", () => {
  const h = mkdtempSync(join(tmpdir(), "hermes-")); mkdirSync(join(h, "profiles", "caesar"), { recursive: true }); writeFileSync(join(h, "profiles", "caesar", "config.yaml"), ""); mkdirSync(join(h, "profiles", ".deleted"), { recursive: true });
  writeFileSync(join(h, ".env"), "A=1\nTYPESAFE_API_KEY=old\nB=2\n"); writeFileSync(join(h, "profiles", "caesar", ".env"), "C=3");
  expect(syncHermesEnv("jev", "sk-new-12345678", h).length).toBe(2);
  expect(readFileSync(join(h, ".env"), "utf8")).toBe("A=1\nB=2\nTYPESAFE_API_KEY=sk-new-12345678\n");
  expect(readFileSync(join(h, "profiles", "caesar", ".env"), "utf8")).toBe("C=3\nTYPESAFE_API_KEY=sk-new-12345678\n");
  expect(existsSync(join(h, "profiles", ".deleted", ".env"))).toBe(false); syncHermesEnv("jev", null, h); expect(readFileSync(join(h, ".env"), "utf8")).toBe("A=1\nB=2\n");
  expect(syncHermesEnv("fish", "x", h)).toEqual([]);
});
