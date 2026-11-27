// A system notice can show on a lock screen: it carries fixed words only, and nothing leaves through a push service.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(import.meta.dir, "..", "web", "atrium", "notify.js"), "utf8");

test("every notice is a fixed sentence, off until switched on, with no outside service", () => {
  const bodies = [...src.matchAll(/show\(([^,)]+)[,)]/g)].map((m) => m[1]!.trim()).filter((a) => a !== "body");
  expect(bodies).toEqual(["'A reply has arrived.'", "'Something is waiting for your approval.'", "'This is a test.'"]);
  expect(src).toContain("localStorage.getItem(KEY) === '1'");
  expect(src).not.toMatch(/pushManager|fetch\(|WebSocket|sendBeacon/);
});
