import { expect, test } from "bun:test";
import { mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildIdOf } from "../core/build-id";

test("the build id changes when an Atrium script changes, and not when an unrelated file does", () => {
  const web = mkdtempSync(join(tmpdir(), "web-")), at = mkdtempSync(join(tmpdir(), "atrium-"));
  writeFileSync(join(web, "index.html"), "<html>"); writeFileSync(join(at, "real.js"), "a"); writeFileSync(join(at, "real.css"), "b");
  const one = buildIdOf(web, at);
  expect(buildIdOf(web, at)).toBe(one);
  writeFileSync(join(at, "real.js"), "changed"); utimesSync(join(at, "real.js"), new Date(), new Date(Date.now() + 5000));
  const two = buildIdOf(web, at); expect(two).not.toBe(one);
  writeFileSync(join(at, "notes.txt"), "ignored"); expect(buildIdOf(web, at)).toBe(two);
  expect(buildIdOf(web, "/nonexistent-dir")).toBe("dev");
});
