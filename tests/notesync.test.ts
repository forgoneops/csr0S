import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addEvent, listEvents, removeEvent, type Event } from "../core/calendar";
import { addTask, importTask, listTasks, removeTask, type Task } from "../core/board";
import { applyData, applyPushed, changedData, changedSince } from "../core/notesync";
import { createNotes } from "../core/notes";

const fresh = () => createNotes(mkdtempSync(join(tmpdir(), "sync-")));

test("a new note is created, an equal one skipped, a different one arrives as a copy, nothing is overwritten", () => {
  const here = fresh();
  here.create("Plan", "mine");
  const r1 = applyPushed(here, "Phone", [{ name: "Fresh", content: "new" }, { name: "Plan", content: "mine" }, { name: "Plan", content: "theirs" }]);
  expect(r1).toEqual({ created: 1, copies: 1, same: 1, held: 0 });
  expect(here.get("Plan")!.content).toBe("mine");
  expect(here.get("Plan (via Phone)")!.content).toBe("theirs");
  // sending the same difference again changes nothing
  expect(applyPushed(here, "Phone", [{ name: "Plan", content: "theirs" }])).toEqual({ created: 0, copies: 0, same: 1, held: 0 });
});
test("copies are never pushed back, so two devices cannot ping-pong", () => {
  const a = fresh(); a.create("Plan", "x"); a.create("Plan (via Phone)", "y");
  expect(changedSince(a, 0).map((n) => n.name)).toEqual(["Plan"]);
  expect(applyPushed(a, "Phone", [{ name: "Plan (via Other)", content: "z" }])).toEqual({ created: 0, copies: 0, same: 0, held: 0 });
});
test("bad names and non-text content are ignored", () => {
  const a = fresh();
  expect(applyPushed(a, "P", [{ name: "../evil", content: "x" }, { name: "Ok", content: 5 }, null as never])).toEqual({ created: 0, copies: 0, same: 0, held: 0 });
  expect(applyPushed(a, "P", "nope")).toEqual({ created: 0, copies: 0, same: 0, held: 0 });
});

test("tasks keep their id, repeat pushes change nothing, and only a newer edit replaces", () => {
  const t = addTask({ title: "Sync me" }) as Task;
  const wire = JSON.parse(JSON.stringify(t)) as Task;
  expect(importTask(wire)).toBe("same");                                  // already here
  removeTask(t.id);
  expect(importTask(wire)).toBe("created"); expect(importTask(wire)).toBe("same");
  expect(importTask({ ...wire, status: "done", updated: wire.updated - 10 })).toBe("same");   // older: ignored
  expect(importTask({ ...wire, status: "done", updated: wire.updated + 10 })).toBe("updated");
  expect(listTasks().find((x) => x.id === t.id)!.status).toBe("done");
  expect(importTask({ id: "nope", title: "x", status: "todo" })).toBe("refused");
  removeTask(t.id);
});
test("events arrive once under their id and bad ones are refused", () => {
  const e = addEvent({ title: "Sync day", date: "2032-05-05", time: "10:00" }) as Event;
  const sent = changedData(e.created - 1).events.find((x) => x.id === e.id)!;
  removeEvent(e.id);
  expect(applyData([], [sent])).toEqual({ tasks: 0, events: 1 });
  expect(applyData([], [sent])).toEqual({ tasks: 0, events: 0 });
  expect(applyData([], [{ id: "x", title: "bad", date: "2032-05-05" }, null])).toEqual({ tasks: 0, events: 0 });
  expect(listEvents("2032-05-01", "2032-05-31").length).toBe(1);
  removeEvent(e.id);
});

test("a copy of a note with a name near the limit keeps its marker (audit by Varro, defect 1)", () => {
  const here = fresh(); const long = "N".repeat(80);
  here.create(long, "mine");
  expect(applyPushed(here, "Phone", [{ name: long, content: "theirs" }])).toEqual({ created: 0, copies: 1, same: 0, held: 0 });
  expect(here.get(long)!.content).toBe("mine");
  expect(here.list().some((n) => n.id !== long && n.id.endsWith("(via Phone)") && n.id.length <= 80)).toBe(true);
});
