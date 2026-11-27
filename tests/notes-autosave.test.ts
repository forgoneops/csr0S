// "Name from heading" may only ever offer a name the note store accepts.
import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.CAESAROS_DATA ??= mkdtempSync(join(tmpdir(), "caesaros-na-"));
const { validName } = await import("../core/notes");
const w: { xHeadingName?: (s: string) => string } = {};
new Function("window", readFileSync(join(import.meta.dir, "..", "web", "atrium", "notes-autosave.js"), "utf8"))(w);
const name = w.xHeadingName!;

describe("a file name from the first heading", () => {
  test("only a first-line heading names the file", () => {
    expect(name("\n# Garden plan\ntext")).toBe("Garden plan");
    expect(name("text\n# Later heading")).toBe("");
    expect(name("#hashtag")).toBe("");
    expect(name("")).toBe("");
  });
  test("hostile headings become a valid single segment or nothing", () => {
    for (const h of ["# ../../etc/passwd", "# a/b\\c", "# <img onerror=x>", "# ...", "# [[Link]] #tag", `# ${"x".repeat(300)}`, "# Zażółć: plan?", "# 🙂"]) {
      const got = name(h);
      if (got) { expect(validName(got)).toBe(true); expect(got).not.toContain("/"); }
    }
    expect(name("# Zażółć: plan?")).toBe("Zażółć plan");
  });
});
