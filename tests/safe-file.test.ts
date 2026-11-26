import { expect, test } from "bun:test";
import { lstatSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readRegularFileNoFollow } from "../core/safe-file";

test("secure file read accepts the expected regular file", () => {
  const root = mkdtempSync(join(tmpdir(), "safe-file-")), file = join(root, "item.txt");
  writeFileSync(file, "safe");
  expect(readRegularFileNoFollow(file, lstatSync(file), root, 100).toString()).toBe("safe");
});

test("secure file read refuses a replaced symlink", () => {
  const root = mkdtempSync(join(tmpdir(), "safe-file-root-")), outside = mkdtempSync(join(tmpdir(), "safe-file-outside-"));
  const file = join(root, "item.txt"), target = join(outside, "secret.txt");
  writeFileSync(file, "safe"); writeFileSync(target, "secret");
  const expected = lstatSync(file);
  const moved = join(root, "moved.txt");
  // A rename plus symlink simulates replacement after the caller's lstat.
  const { renameSync } = require("node:fs");
  renameSync(file, moved); symlinkSync(target, file);
  expect(() => readRegularFileNoFollow(file, expected, root, 100)).toThrow();
});

test("secure file read rejects a mismatched expected identity", () => {
  const root = mkdtempSync(join(tmpdir(), "safe-file-")), a = join(root, "a.txt"), b = join(root, "b.txt");
  writeFileSync(a, "a"); writeFileSync(b, "b");
  expect(() => readRegularFileNoFollow(a, lstatSync(b), root, 100)).toThrow();
});
