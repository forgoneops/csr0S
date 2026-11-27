import { expect, test } from "bun:test";
import { resolveRoot } from "../core/root";

test("the environment wins, then the resources folder next to a compiled binary, then the source tree", () => {
  expect(resolveRoot("/opt/app/resources", "/$bunfs/root", "/opt/other/caesaros-core", () => true)).toBe("/opt/app/resources");
  expect(resolveRoot(undefined, "/$bunfs/root", "/opt/app/caesaros-core", (p) => p === "/opt/app/resources")).toBe("/opt/app/resources");
  expect(resolveRoot(undefined, "/$bunfs/root", "/opt/app/caesaros-core", () => false)).toBe("/$bunfs");
  expect(resolveRoot(undefined, "/repo/core", "/usr/bin/bun", () => true)).toBe("/repo");
});
