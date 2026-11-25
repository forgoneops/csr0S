import { expect, test } from "bun:test";
import { addDoc } from "../core/knowledge";
import { getProject, listProjects, removeProject, saveProject, type Project } from "../core/projects";

test("a project is made, edited and removed; unknown documents are dropped", () => {
  const doc = addDoc("Spec", "some text to know");
  const docId = "id" in doc ? doc.id : "";
  const p = saveProject({ name: "  Shell  ", instructions: "Answer briefly", engine: "claude", docs: [docId, "nope"] }) as Project;
  expect(p.name).toBe("Shell"); expect(p.docs).toEqual([docId]);
  const q = saveProject({ instructions: "Answer in Polish" }, p.id) as Project;
  expect(q.instructions).toBe("Answer in Polish"); expect(q.name).toBe("Shell"); expect(q.engine).toBe("claude");
  expect(listProjects().some((x) => x.id === p.id)).toBe(true);
  expect(removeProject(p.id)).toBe(true); expect(getProject(p.id)).toBeNull();
});
test("a project needs a name and an unknown id is not found", () => {
  expect(saveProject({ name: "   " })).toEqual({ error: "name" });
  expect(saveProject({ name: "x" }, "missing")).toEqual({ error: "not_found" });
});
