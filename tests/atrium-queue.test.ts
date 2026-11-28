import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const bridge = readFileSync(join(import.meta.dir, "..", "web/atrium/bridge.js"), "utf8");

test("a message queued behind a running answer is kept across a reload and restored when the conversation loads", () => {
  expect(bridge).toContain("caesaros.queue.");
  expect(bridge).toMatch(/const saveQ = /); expect(bridge).toMatch(/const loadQ = /);
  expect(bridge).toMatch(/push\(\{ v, sendFiles, reply, paint \}\); saveQ\(id\)/);   // saved when it is queued
  expect(bridge).toMatch(/shift\(\); saveQ\(id\)/);                                  // and again when it leaves the queue
  expect(bridge).toMatch(/const saved = loadQ\(id\)/);                               // restored on load
});

test("a running answer can be stopped on its own, and a queued message can be sent now", () => {
  expect(bridge).toContain("window.xStopTurn");
  expect(bridge).toMatch(/signal: ac\.signal/);        // the request is abortable, the server stops the run with it
  expect(bridge).toContain("data-stopturn"); expect(bridge).toContain("data-qnow");
  expect(bridge).toMatch(/reply\.run = false; delete ABORT\[id\]/);
});
