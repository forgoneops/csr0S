import { expect, test } from "bun:test";
import { addTask, removeTask, type Task } from "../core/board";
import { addEvent, removeEvent, type Event } from "../core/calendar";
import { addDoc, removeDoc } from "../core/knowledge";
import { searchAll } from "../core/search";

test("one query finds a library passage, a board task and a calendar event, each labelled", () => {
  const doc = addDoc("Search doc", "The zebrafinch song is documented here.") as { id: string };
  const task = addTask({ title: "Feed the zebrafinch" }) as Task;
  const ev = addEvent({ title: "Zebrafinch census", date: "2031-03-03", time: "08:00" }) as Event;
  const kinds = searchAll("zebrafinch").map((h) => h.kind).sort();
  expect(kinds).toEqual(["board", "calendar", "library"]);
  removeDoc(doc.id); removeTask(task.id); removeEvent(ev.id);
  expect(searchAll("zebrafinch")).toEqual([]);
});
test("a short query returns nothing and a percent sign is not a wildcard", () => {
  expect(searchAll("z")).toEqual([]);
  const task = addTask({ title: "Plain title" }) as Task;
  expect(searchAll("%%")).toEqual([]); removeTask(task.id);
});
