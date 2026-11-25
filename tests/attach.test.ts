// Plan 7.7: attach and the caesar-layer tool server. Removal must leave the agent's config exactly as it was.
import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { codexAdd, codexRemove, claudeHookAdd, claudeHookRemove, shareEdit, backup } from "../tools/attach";
import { search, listNotes, start, recent, read, readShare } from "../tools/caesar-layer-mcp";

describe("codex block", () => {
  const base = `model = "x"\n\n[mcp_servers.other]\ncommand = "y"\n`;
  test("add then remove restores the file byte for byte, and add is idempotent", () => {
    const once = codexAdd(base);
    expect(once).toContain("[mcp_servers.caesar-layer]");
    expect(codexAdd(once)).toBe(once);
    expect(codexRemove(once)).toBe(base);
  });
  test("an empty file round trips and removing from a file without the block changes nothing", () => {
    expect(codexRemove(codexAdd(""))).toBe("");
    expect(codexRemove(base)).toBe(base);
  });
});

describe("claude hook", () => {
  const s = { model: "m", hooks: { SessionStart: [{ matcher: "^startup$", hooks: [{ type: "command", command: "bash other.sh" }] }] } };
  test("keeps the other hooks, is idempotent, and remove restores the settings", () => {
    const a = claudeHookAdd(s);
    expect(a.hooks!.SessionStart!.length).toBe(2);
    expect(claudeHookAdd(a)).toEqual(a);
    expect(claudeHookRemove(a)).toEqual(s);
  });
  test("remove drops empty hook containers it created", () => {
    expect(claudeHookRemove(claudeHookAdd({ model: "m" }))).toEqual({ model: "m" });
  });
});

describe("brain reading", () => {
  const dir = mkdtempSync(join(tmpdir(), "layer-"));
  mkdirSync(join(dir, "Projects")); mkdirSync(join(dir, ".trash"));
  writeFileSync(join(dir, "Projects/Atrium.md"), "The shell is a web OS."); writeFileSync(join(dir, ".trash/Gone.md"), "shell secret");
  test("search finds by name and body, skips the trash", () => {
    expect(search("shell", dir).map((x) => x.id)).toEqual(["Projects/Atrium"]);
    expect(search("atrium", dir)[0].id).toBe("Projects/Atrium");
    expect(search("", dir)).toEqual([]);
    expect(listNotes(dir).length).toBe(1);
  });
});

describe("topic start and recent changes", () => {
  const dir = mkdtempSync(join(tmpdir(), "layer-topic-"));
  mkdirSync(join(dir, "Rydla"));
  writeFileSync(join(dir, "Rydla/About.md"), "A reel for a friend."); writeFileSync(join(dir, "Rydla/Decisions.md"), "- 2026-11-07 her own voice\n- no cloning");
  writeFileSync(join(dir, "Rydla/Script.md"), "scene one"); writeFileSync(join(dir, "Other.md"), "rydla is mentioned here");
  test("one call returns About, Decisions and the newest notes of the folder", () => {
    const out = start("rydla", dir);
    expect(out).toContain("## About (Rydla/About)\nA reel for a friend.");
    expect(out).toContain("her own voice");
    expect(out).toContain("- Rydla/Script");
  });
  test("no folder falls back to a search, and an unknown topic says so", () => {
    expect(start("other", dir)).toContain("Other");
    expect(start("nothing-here", dir)).toBe("Nothing in the Brain about nothing-here.");
    expect(start("", dir)).toBe("name a topic");
  });
  test("recent lists only notes changed inside the window", () => {
    expect(recent(7, dir).length).toBe(4);
    expect(recent(7, dir, Date.now() + 30 * 864e5)).toEqual([]);
  });
});

// from the independent review of 2026-11-23 (claude-a)
describe("what an attached agent may read", () => {
  const dir = mkdtempSync(join(tmpdir(), "layer-share-")); const data = mkdtempSync(join(tmpdir(), "layer-data-"));
  mkdirSync(join(dir, "Shared")); mkdirSync(join(dir, "Private")); mkdirSync(join(dir, ".trash")); mkdirSync(join(dir, "Outside"));
  writeFileSync(join(dir, "Shared/Plan.md"), "the plan"); writeFileSync(join(dir, "Private/Diary.md"), "the plan is a secret"); writeFileSync(join(dir, ".trash/Gone.md"), "the plan trash");
  symlinkSync(join(dir, "Private"), join(dir, "Shared/Link"));
  const share = { folders: ["Shared"], notes: [] };
  test("with nothing shared the file says so, and a broken file shares nothing", () => {
    expect(readShare(data)).toEqual({ folders: [], notes: [] });
    writeFileSync(join(data, "layer-share.json"), "{not json"); expect(readShare(data)).toEqual({ folders: [], notes: [] });
    writeFileSync(join(data, "layer-share.json"), JSON.stringify({ folders: ["Shared"] })); expect(readShare(data)).toEqual({ folders: ["Shared"], notes: [] });
  });
  test("search, start, recent and read see only the shared folder", () => {
    expect(search("plan", dir, 12, share).map((x) => x.id)).toEqual(["Shared/Plan"]);
    expect(listNotes(dir, share).map((m) => m.id)).toEqual(["Shared/Plan"]);
    expect(read("Private/Diary", dir, share)).toBe(null);
    expect(start("Private", dir, share)).toContain("Nothing in the Brain about Private");
    expect(recent(7, dir, Date.now(), share)).toEqual(["Shared/Plan"]);
  });
  test("hidden folders and a linked folder are never read, even by id", () => {
    expect(read(".trash/Gone", dir)).toBe(null);
    expect(read("Shared/Link/Diary", dir, share)).toBe(null);
    expect(read("/etc/passwd", dir)).toBe(null);
    expect(listNotes(dir).map((m) => m.id).sort()).toEqual(["Outside/".slice(0, 0) || "Private/Diary", "Shared/Plan"].sort());
  });
  test("share and unshare edit the list, refusing paths that climb or hide", () => {
    const a = shareEdit({ folders: [], notes: [] }, true, ["Projects", "/Daily/", "../etc", ".trash", "A/.hidden"]);
    expect(a.folders).toEqual(["Projects", "Daily"]);
    expect(shareEdit(a, false, ["Daily"]).folders).toEqual(["Projects"]);
  });
});
describe("attach safety", () => {
  test("one codex marker without the other stops instead of writing a second block", () => {
    const once = codexAdd('model = "x"\n');
    const broken = once.replace(/# <<< caesaros attach[^\n]*\n/, "");
    expect(() => codexAdd(broken)).toThrow("marker");
    expect(() => codexRemove(broken)).toThrow("marker");
  });
  test("backups are private and only the last three are kept", () => {
    const home = mkdtempSync(join(tmpdir(), "bk-")); const f = join(home, "settings.json"); writeFileSync(f, "{}");
    for (let i = 0; i < 5; i++) { backup(f, home); }
    const dirb = join(home, "caesaros-attach-backup"), left = readdirSync(dirb);
    expect(left.length).toBeLessThanOrEqual(3);
    expect(statSync(join(dirb, left[0])).mode & 0o077).toBe(0);
  });
});
