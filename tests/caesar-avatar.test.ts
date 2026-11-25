// Konrad, 2026-11-21: the flat ape mark is gone everywhere; Caesar's face is the portrait.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { listCrew } from "../core/crew";

test("no source still points Caesar at the old flat mark", () => {
  for (const f of ["core/crew.ts", "web/atrium/bridge.js"]) expect(readFileSync(f, "utf8")).not.toContain("art/mark.webp");
  const c = listCrew().find((m) => m.id === "caesar");
  expect(c?.img ?? "art/caesaros-caesar-neo.webp").toBe("art/caesaros-caesar-neo.webp");
});
