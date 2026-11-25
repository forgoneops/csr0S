import { expect, test } from "bun:test";
import { addDoc, folders, listDocs, removeDoc, search, setFolder, split } from "../core/knowledge";

test("split cuts long text at paragraph ends and keeps every word", () => {
  const text = Array.from({ length: 30 }, (_, i) => `Paragraph ${i} ` + "word ".repeat(40)).join("\n\n");
  const parts = split(text);
  expect(parts.length).toBeGreaterThan(5);
  expect(parts.every((p) => p.length <= 800)).toBe(true);
  expect(parts.join(" ").replace(/\s+/g, " ")).toContain("Paragraph 29");
});
test("a document is added, found by any word with Polish letters, and removed", () => {
  const r = addDoc("Notatka", "Zażółć gęślą jaźń. Łódź jest miastem filmowym.");
  expect("id" in r).toBe(true);
  expect(search("lodz filmowym").map((x) => x.name)).toContain("Notatka");
  expect(listDocs().some((d) => d.name === "Notatka")).toBe(true);
  if ("id" in r) { expect(removeDoc(r.id)).toBe(true); expect(search("lodz")).toEqual([]); }
});
test("search text cannot inject FTS operators and empty input is refused", () => {
  expect(search('" OR *')).toEqual([]);
  expect(addDoc("x", "  ")).toEqual({ error: "empty" });
  expect(addDoc("", "text")).toEqual({ error: "name" });
});

test("a document goes into a folder, folders are counted, and taking it out removes the folder", () => {
  const a = addDoc("In folder A", "alpha text") as { id: string }, b = addDoc("Also in A", "beta text") as { id: string };
  expect(setFolder(a.id, "  Projects  ")).toBe(true); setFolder(b.id, "Projects");
  expect(folders().find((f) => f.folder === "Projects")).toEqual({ folder: "Projects", count: 2 });
  expect(listDocs().find((d) => d.id === a.id)!.folder).toBe("Projects");
  setFolder(a.id, ""); setFolder(b.id, "");
  expect(folders().some((f) => f.folder === "Projects")).toBe(false);
  expect(setFolder("missing", "x")).toBe(false);
  removeDoc(a.id); removeDoc(b.id);
});
