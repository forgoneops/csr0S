import { expect, test } from "bun:test";
import { addTask, listTasks, removeTask, updateTask, type Task } from "../core/board";

test("a task is added, moved between columns, edited and removed", () => {
  const t = addTask({ title: "  Write the plan  " }) as Task;
  expect(t.title).toBe("Write the plan"); expect(t.status).toBe("todo");
  const m = updateTask(t.id, { status: "doing" }) as Task;
  expect(m.status).toBe("doing"); expect(m.title).toBe("Write the plan");
  expect((updateTask(t.id, { note: "details" }) as Task).note).toBe("details");
  expect(listTasks().some((x) => x.id === t.id)).toBe(true);
  expect(removeTask(t.id)).toBe(true); expect(removeTask(t.id)).toBe(false);
});
test("a task needs a title, a bad status falls back, an unknown id is not found", () => {
  expect(addTask({ title: "   " })).toEqual({ error: "title" });
  const t = addTask({ title: "x", status: "nonsense" }) as Task; expect(t.status).toBe("todo"); removeTask(t.id);
  expect(updateTask("missing", { status: "done" })).toEqual({ error: "not_found" });
});
test("a moved task goes to the end of its new column", () => {
  const a = addTask({ title: "a", status: "done" }) as Task, b = addTask({ title: "b" }) as Task;
  const moved = updateTask(b.id, { status: "done" }) as Task;
  expect(moved.pos).toBeGreaterThan(a.pos); removeTask(a.id); removeTask(b.id);
});
