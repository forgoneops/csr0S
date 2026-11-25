import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mirror, parseCurator, parseKanban } from "../core/mirror";

test("each profile gets its memory size, user-note size and skill count, and no text is returned", () => {
  const home = mkdtempSync(join(tmpdir(), "hermes-")), old = process.env.HERMES_HOME;
  const prof = join(home, "profiles", "alpha"); mkdirSync(join(prof, "memories"), { recursive: true }); mkdirSync(join(prof, "skills", "one"), { recursive: true }); mkdirSync(join(prof, "skills", "grp", "two"), { recursive: true });
  writeFileSync(join(prof, "config.yaml"), "model:\n  default: x\n"); writeFileSync(join(prof, "memories", "MEMORY.md"), "secret memory text"); writeFileSync(join(prof, "memories", "USER.md"), "hi");
  writeFileSync(join(prof, "skills", "one", "SKILL.md"), "x"); writeFileSync(join(prof, "skills", "grp", "two", "SKILL.md"), "y");
  process.env.HERMES_HOME = home;
  try {
    const rows = mirror(), r = rows.find((x) => x.id === "alpha")!;
    expect(r).toBeTruthy();
    expect(r.memoryBytes).toBe("secret memory text".length); expect(r.userBytes).toBe(2); expect(r.skills).toBe(2); expect(r.memoryAt).toBeGreaterThan(0);
    expect(JSON.stringify(rows)).not.toContain("secret memory text");
    expect(Object.keys(r).sort()).toEqual(["id", "memoryAt", "memoryBytes", "name", "skills", "userBytes"]);
  } finally { if (old === undefined) delete process.env.HERMES_HOME; else process.env.HERMES_HOME = old; }
});

test("kanban keeps titles and states only, and curator drops file paths", () => {
  const k = parseKanban(JSON.stringify([{ id: "t_1", title: "Do it", status: "done", assignee: "varro", body: "private", result: "private", created_at: 5 }, { nope: 1 }]));
  expect(k).toEqual([{ id: "t_1", title: "Do it", status: "done", assignee: "varro", at: 5 }]);
  expect(parseKanban("not json")).toEqual([]);
  const c = parseCurator("curator: ENABLED\n  runs: 4\n  last report:    /srv/x/logs/x\n  stale after: 14d");
  expect(c.enabled).toBe(true); expect(c.lines.join("|")).not.toContain("/srv/"); expect(c.lines.length).toBe(3);
});
