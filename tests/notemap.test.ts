import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createNotes } from "../core/notes";
import { layout } from "../core/graphlayout";

test("the map: [[links]] become edges (by full id or file name), unknown and self links are dropped, notes get fixed positions", () => {
  const n = createNotes(mkdtempSync(join(tmpdir(), "map-")));
  n.create("Plants/Garden", "see [[Tomato]] and [[Garden]] and [[Nope]]"); n.create("Tomato", "back to [[Plants/Garden|the garden]]"); n.create("Lonely", "no links");
  const g = n.graph();
  expect(g.total).toBe(3); expect(g.truncated).toBe(false);
  expect(g.edges.map((e) => `${e.from}>${e.to}`).sort()).toEqual(["Plants/Garden>Tomato", "Tomato>Plants/Garden"]);
  const garden = g.nodes.find((x) => x.id === "Plants/Garden")!;
  expect(garden).toMatchObject({ title: "Garden", folder: "Plants", degree: 2 });
  expect(g.nodes.every((x) => x.updated > 0)).toBe(true);        // the glow and the activity list need when each note changed
  expect(g.nodes.every((x) => Number.isFinite(x.x) && Number.isFinite(x.y))).toBe(true);
  expect(n.graph().nodes.map((x) => x.id)).toEqual(g.nodes.map((x) => x.id)); expect(n.graph().nodes.map((x) => [x.x, x.y])).toEqual(g.nodes.map((x) => [x.x, x.y]));   // deterministic: the map does not move between visits
});
test("layout keeps linked notes inside the page and puts unlinked ones in a strip below them", () => {
  const ids = ["a", "b", "c", "d"], p = layout(ids, [{ from: "a", to: "b" }, { from: "b", to: "c" }]);
  for (const id of ["a", "b", "c"]) { const q = p.get(id)!; expect(q.x).toBeGreaterThanOrEqual(70); expect(q.x).toBeLessThanOrEqual(930); }
  expect(p.get("d")!.y).toBeGreaterThan(Math.max(p.get("a")!.y, p.get("b")!.y, p.get("c")!.y));
});
