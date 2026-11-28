import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const GUARD = join(import.meta.dir, "..", "tools", "data-guard.ts");
function run(copy: boolean, name: boolean) {
  const root = mkdtempSync(join(tmpdir(), "guard-")); const data = join(root, "data"); const repo = join(root, "repo");
  mkdirSync(join(data, "notes"), { recursive: true }); mkdirSync(repo);
  const note = "A private note body that is long enough to count as a file.\n";
  writeFileSync(join(data, "notes", "quarterly-client-plan.md"), note);
  writeFileSync(join(repo, "a.txt"), copy ? note : "nothing of yours here, only code and a short sentence\n");
  writeFileSync(join(repo, "b.txt"), name ? "see quarterly-client-plan for details, plain words here\n" : "plain words here, no note names at all in this file\n");
  spawnSync("git", ["init", "-q"], { cwd: repo }); spawnSync("git", ["add", "-A"], { cwd: repo });
  return spawnSync("bun", [GUARD], { cwd: repo, env: { ...process.env, CAESAROS_DATA: data }, encoding: "utf8" }).status;
}
test("data guard passes a clean repo", () => expect(run(false, false)).toBe(0));
test("data guard stops a copied data file", () => expect(run(true, false)).toBe(1));
test("data guard stops a note name in a tracked file", () => expect(run(false, true)).toBe(1));

test("data guard lets a note name through when the repo already uses it as its own vocabulary", () => {
  const root = mkdtempSync(join(tmpdir(), "guard-")); const data = join(root, "data"), repo = join(root, "repo");
  mkdirSync(join(data, "notes"), { recursive: true }); mkdirSync(join(repo, "skills", "quarterly-client-plan"), { recursive: true });
  writeFileSync(join(data, "notes", "quarterly-client-plan.md"), "A private note body that is long enough to count as a file.\n");
  writeFileSync(join(repo, "skills", "quarterly-client-plan", "SKILL.md"), "the skill quarterly-client-plan does a public thing, plain words\n");
  writeFileSync(join(repo, "b.txt"), "see quarterly-client-plan for details, plain words here\n");
  spawnSync("git", ["init", "-q"], { cwd: repo }); spawnSync("git", ["add", "-A"], { cwd: repo });
  expect(spawnSync("bun", [GUARD], { cwd: repo, env: { ...process.env, CAESAROS_DATA: data }, encoding: "utf8" }).status).toBe(0);
});
