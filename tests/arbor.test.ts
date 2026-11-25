// The Arbor: the notes as a tree. Folders are branches, notes are leaves along them, older ones nearer the trunk. Deterministic, so the tree does not move between visits.
import { expect, test } from "bun:test";
import { treeLayout } from "../core/arbor";

const N = (id: string, folder: string, updated: number) => ({ id, folder, updated });
const notes = [N("Garden/a", "Garden", 3), N("Garden/b", "Garden", 1), N("Garden/c", "Garden", 2), N("Work/x", "Work", 5), N("loose", "", 4)];

test("every note gets a finite place inside the page, and one branch per folder starts at the trunk", () => {
  const t = treeLayout(notes);
  expect(Object.keys(t.nodes).sort()).toEqual(notes.map((n) => n.id).sort());
  for (const [x, y] of Object.values(t.nodes)) { expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true); expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(1000); expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(640); }
  expect(t.branches.map((b) => b.folder).sort()).toEqual(["", "Garden", "Work"]);
  expect(new Set(t.branches.map((b) => `${b.x1},${b.y1}`)).size).toBe(1);        // all start at the same point of the trunk
});
test("within a folder the older note sits nearer the trunk than the newer one", () => {
  const t = treeLayout(notes), d = (id: string) => Math.hypot(t.nodes[id]![0] - t.branches[0]!.x1, t.nodes[id]![1] - t.branches[0]!.y1);
  const g = t.branches.find((b) => b.folder === "Garden")!, dist = (id: string) => Math.hypot(t.nodes[id]![0] - g.x1, t.nodes[id]![1] - g.y1);
  expect(dist("Garden/b")).toBeLessThan(dist("Garden/c")); expect(dist("Garden/c")).toBeLessThan(dist("Garden/a")); void d;
});
test("the same notes give the same tree, and an empty vault gives an empty tree", () => {
  expect(treeLayout(notes)).toEqual(treeLayout([...notes].reverse()));
  expect(treeLayout([])).toEqual({ nodes: {}, branches: [] });
});
