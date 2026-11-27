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
test("a conversation is found by its title and by its text, once each", async () => {
  const { createSession, appendMessage } = await import("../core/chat");
  const s = createSession({ title: "Quokkaplan", engine: "echo" });
  appendMessage(s.id, { role: "user", content: "all about quokkaplan today" });
  appendMessage(s.id, { role: "user", content: "more quokkaplan" });
  const t = createSession({ title: "Quokkaplan only title", engine: "echo" });
  const hits = searchAll("quokkaplan").filter((h) => h.kind === "chat");
  expect(hits.map((h) => h.ref).sort()).toEqual([s.id, t.id].sort());
  expect(hits.find((h) => h.ref === t.id)!.title).toBe("Quokkaplan only title");
});
test("an uploaded library file is found by name, and one in the trash is not", async () => {
  await import("../core/library-files");
  const { db } = await import("../core/db");
  db.query("INSERT INTO lib_files (id, name, kind, ext, bytes, folder, added, trashed) VALUES ('f1','Axolotl atlas','doc','pdf',1,'',1,0), ('f2','Axolotl old','doc','pdf',1,'',1,5)").run();
  expect(searchAll("axolotl")).toEqual([{ kind: "library", title: "Axolotl atlas", text: "PDF file", ref: "file:f1" }]);
  db.query("DELETE FROM lib_files WHERE id IN ('f1','f2')").run();
});
