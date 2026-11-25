// Plan 3.3a: the Board's drift detector. A card is a plan item whose state comes from what was observed, not from where it was dragged.
import { expect, test } from "bun:test";
import { addTask, listTasks, removeTask, updateTask, type Task } from "../core/board";
import { applyFix, detectDrift, stateOf } from "../core/drift";

const DAY = 864e5, NOW = 1_800_000_000_000;
const t = (o: Partial<Task>): Task => ({ id: crypto.randomUUID(), title: "x", note: "", status: "todo", pos: 0, created: NOW - 40 * DAY, updated: NOW - DAY, evidence: "", by: "", after: "", ...o });

test("the state of a card comes from what was seen: planned, started, observed, verified, claimed", () => {
  expect(stateOf(t({ status: "todo" }), 0)).toBe("planned");
  expect(stateOf(t({ status: "doing" }), 0)).toBe("started");
  expect(stateOf(t({ status: "doing" }), 2)).toBe("observed");
  expect(stateOf(t({ status: "done", evidence: "tests green" }), 0)).toBe("verified");
  expect(stateOf(t({ status: "done" }), 0)).toBe("claimed");
});

test("the detector finds a done card without evidence, a stale Doing card, a plan item nobody picked up, duplicates, and work with no card", () => {
  const done = t({ title: "Ship it", status: "done" }), stale = t({ title: "Old work", status: "doing", updated: NOW - 5 * DAY }), idle = t({ title: "Someday", status: "todo", updated: NOW - 20 * DAY });
  const a = t({ title: "Same card", status: "todo" }), b = t({ title: "same card ", status: "todo", created: NOW - 2 * DAY });
  const fresh = t({ title: "Fine", status: "doing", updated: NOW - 3600_000 }), proven = t({ title: "Proven", status: "done", evidence: "bun test: 0 fail" });
  const kinds = (running: number, tasks: Task[]) => detectDrift(tasks, { now: NOW, running }).map((d) => `${d.kind}:${d.title ?? ""}`).sort();
  expect(kinds(0, [done, stale, idle, a, b, fresh, proven])).toEqual(["duplicate:same card ", "no-evidence:Ship it", "stale:Old work", "unpicked:Someday"]);
  expect(kinds(1, [idle]).includes("no-card:")).toBe(true);            // something runs and no card is in Doing
  expect(kinds(1, [fresh]).includes("no-card:")).toBe(false);
  expect(kinds(0, [t({ status: "done", updated: NOW - 90 * DAY })])).toEqual([]);   // old finished cards from before evidence existed are not nagged about
});

test("every bullet carries a one-tap fix, and the fix does what it says", () => {
  const stale = addTask({ title: "drift-stale", status: "doing" }) as Task, done = addTask({ title: "drift-done", status: "done" }) as Task, dup1 = addTask({ title: "drift-dup" }) as Task, dup2 = addTask({ title: "Drift-Dup" }) as Task;
  const d = detectDrift(listTasks(), { now: Date.now() + 5 * DAY, running: 0 }).filter((x) => x.title?.toLowerCase().startsWith("drift-"));
  expect(d.every((x) => x.fix.label.length > 0)).toBe(true);
  expect(applyFix("stale", stale.id)).toEqual({ ok: true }); expect(listTasks().find((x) => x.id === stale.id)!.status).toBe("todo");
  expect(applyFix("no-evidence", done.id)).toEqual({ ok: true }); expect(listTasks().find((x) => x.id === done.id)!.status).toBe("doing");
  expect(applyFix("duplicate", dup2.id)).toEqual({ ok: true }); expect(listTasks().some((x) => x.id === dup2.id)).toBe(false); expect(listTasks().some((x) => x.id === dup1.id)).toBe(true);
  expect(applyFix("stale", "nope")).toEqual({ error: "not_found" }); expect(applyFix("bogus" as never, dup1.id)).toEqual({ error: "bad_kind" });
  for (const x of [stale, done, dup1]) removeTask(x.id);
});

test("evidence is saved with the card", () => {
  const c = addTask({ title: "drift-ev", status: "done", evidence: "tsc clean" }) as Task;
  expect(c.evidence).toBe("tsc clean");
  expect((updateTask(c.id, { evidence: "tsc clean, bun test 0 fail" }) as Task).evidence).toBe("tsc clean, bun test 0 fail");
  removeTask(c.id);
});
