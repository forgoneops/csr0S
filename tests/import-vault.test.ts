import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validName } from "../core/notes";

test("the vault importer keeps every note name valid, even when two long names collapse into one", () => {
  const src = mkdtempSync(join(tmpdir(), "vault-")), data = mkdtempSync(join(tmpdir(), "inst-"));
  mkdirSync(join(src, "Sessions"));
  const long = "x".repeat(78);
  writeFileSync(join(src, "Sessions", `${long}:a.md`), "one");       // ":" is not allowed, becomes "-" and the two names collide
  writeFileSync(join(src, "Sessions", `${long}-a.md`), "two");
  writeFileSync(join(src, "Sessions", `${long}?a.md`), "three");
  const r = Bun.spawnSync(["bun", join(import.meta.dir, "..", "tools", "import-vault.ts"), src, data, "--apply"]);
  expect(r.exitCode).toBe(0);
  const out = readdirSync(join(data, "notes", "Sessions")).map((f) => `Sessions/${f.replace(/\.md$/, "")}`);
  expect(out.length).toBe(3);
  for (const id of out) expect(validName(id)).toBe(true);
});
