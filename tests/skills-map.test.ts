import { expect, test } from "bun:test";
import { Hono } from "hono";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanSkills, skillsApi } from "../core/skills";

test("a skill carries the agents that have it, its tags and a readable body", async () => {
  const a = mkdtempSync(join(tmpdir(), "x-")), h = join(mkdtempSync(join(tmpdir(), "y-")), ".hermes", "skills");
  for (const d of [a, h]) { mkdirSync(join(d, "caesar-vault-sync"), { recursive: true }); writeFileSync(join(d, "caesar-vault-sync", "SKILL.md"), "---\nname: caesar-vault-sync\ndescription: Sync\n---\n# Hello body"); }
  const s = scanSkills([a, h]);
  expect(s).toHaveLength(1);
  expect(s[0]!.agents.sort()).toEqual(["CaesarOS", "Hermes"]);
  expect(s[0]!.tags).toEqual(expect.arrayContaining(["pack", "owner-only"]));
  const app = new Hono(); skillsApi(app, () => true, [a]);
  expect(await (await app.request("/api/skills/body?id=caesar-vault-sync")).json()).toEqual({ body: "# Hello body" });
  expect((await app.request("/api/skills/body?id=../x")).status).toBe(404);
});
