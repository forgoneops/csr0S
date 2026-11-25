import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createNotes } from "../core/notes";

test("tags and backlinks are read from the text, headings are not tags", () => {
  const n = createNotes(mkdtempSync(join(tmpdir(), "notes-")));
  n.create("Plan", "# Plan\nWork on #Shell and #ideas/new. See [[Ideas]].");
  n.create("Ideas", "Some idea #ideas/new and a link to [[Plan|the plan]]");
  n.create("Other", "no tags here, mentions [[Ideas#Heading]]");
  expect(n.tags()).toEqual([{ tag: "ideas/new", count: 2 }, { tag: "shell", count: 1 }]);
  expect(n.withTag("SHELL").map((m) => m.id)).toEqual(["Plan"]);
  expect(n.backlinks("Ideas").sort()).toEqual(["Other", "Plan"]);
  expect(n.backlinks("Plan")).toEqual(["Ideas"]);
});
