// Notes are the owner's files: safe names, atomic writes, no silent overwrite, no destruction, no symlink games.
import { beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Note } from "../core/notes";

// core/db fixes the data folder at import, so set it before anything imports core (effective when this file runs alone).
process.env.CAESAROS_DATA ??= mkdtempSync(join(tmpdir(), "caesaros-nt-"));
process.env.CAESAROS_MODULE_DIRS = "plugins";
const { createNotes, MAX_NOTE_BYTES, revOf, validName } = await import("../core/notes");

let dir: string;
let n: ReturnType<typeof createNotes>;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "caesaros-notes-")); n = createNotes(dir); });
const ok = (r: { note: Note } | { error: string }): { note: Note } => { if ("error" in r) throw new Error(`unexpected ${r.error}`); return r; };

describe("names", () => {
  test("letters, digits, spaces and a few marks are fine; separators, dots-first, .. and edges are not", () => {
    for (const good of ["Plan", "Sessions/2026-11-20 bridge", "a/b/c", "Zażółć gęślą jaźń", "2026-11-22 notes", "a.b (1)", "x".repeat(80)]) expect(validName(good)).toBe(true);
    for (const bad of ["", ".hidden", "../x", "a\\b", "x..y", " lead", "trail ", "x".repeat(81), "a//b", "/a", "a/", "a/../b", ".x/y", "a/.hidden", "1/2/3/4/5/6/7", "tab\there", "nul\0x", 42, null, undefined]) expect(validName(bad)).toBe(false);
  });
});

describe("create, read, update", () => {
  test("a note without a name becomes Untitled, then Untitled 2", () => {
    expect(ok(n.create(undefined, "a")).note.id).toBe("Untitled");
    expect(ok(n.create("", "b")).note.id).toBe("Untitled 2");
    expect(existsSync(join(dir, "Untitled.md"))).toBe(true);
  });
  test("an existing name, a bad name and a huge body are refused", () => {
    n.create("A", "x");
    expect(n.create("A", "y")).toEqual({ error: "exists" });
    expect(n.create("../etc/passwd", "y")).toEqual({ error: "invalid_name" });
    expect(n.create("Big", "x".repeat(MAX_NOTE_BYTES + 1))).toEqual({ error: "too_large" });
    expect(readdirSync(dir).filter((f) => f.endsWith(".md"))).toEqual(["A.md"]);
  });
  test("update needs the revision you saw; a stale one gets a conflict with the current text and changes nothing", () => {
    const a = ok(n.create("A", "one")).note;
    const saved = ok(n.update("A", { content: "two", rev: a.rev })).note;
    expect(saved.content).toBe("two");
    expect(saved.rev).toBe(revOf("two"));
    const stale = n.update("A", { content: "three", rev: a.rev });
    expect(stale).toMatchObject({ error: "conflict", current: { content: "two" } });
    expect(n.get("A")!.content).toBe("two");
    expect(n.update("A", { content: "x" })).toMatchObject({ error: "conflict" });          // no revision at all is also a conflict
    expect(n.update("Nope", { content: "x", rev: "r" })).toEqual({ error: "not_found" });
  });
  test("renaming moves the file, refuses an existing target and a bad name, and keeps the text", () => {
    const a = ok(n.create("A", "body")).note;
    n.create("B", "other");
    expect(n.update("A", { rev: a.rev, name: "B" })).toEqual({ error: "exists" });
    expect(n.update("A", { rev: a.rev, name: "../x" })).toEqual({ error: "invalid_name" });
    const r = ok(n.update("A", { rev: a.rev, name: "C" })).note;
    expect(r).toMatchObject({ id: "C", content: "body" });
    expect(n.get("A")).toBeNull();
  });
  test("no temp file is left behind", () => {
    const a = ok(n.create("A", "x")).note; n.update("A", { content: "y", rev: a.rev });
    expect(readdirSync(dir).filter((f) => f.endsWith(".tmp"))).toEqual([]);
  });
});

describe("trash", () => {
  test("delete moves the file to .trash, keeps the text, and a second delete is not_found", () => {
    n.create("A", "keep me");
    expect(n.trash("A")).toEqual({ ok: true });
    expect(n.get("A")).toBeNull();
    expect(n.list()).toEqual([]);
    const kept = readdirSync(join(dir, ".trash"));
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatch(/^A\.\d+\.md$/);
    expect(n.trash("A")).toEqual({ error: "not_found" });
    expect(n.trash("../x")).toEqual({ error: "invalid_name" });
  });
});

describe("a symlink is never followed", () => {
  test("a link in the folder is invisible to list, get, search, update and trash", () => {
    const secret = join(dir, "..", "secret-" + Date.now() + ".txt"); writeFileSync(secret, "TOP SECRET");
    symlinkSync(secret, join(dir, "evil.md"));
    expect(n.list().map((m) => m.id)).toEqual([]);
    expect(n.get("evil")).toBeNull();
    expect(n.search("secret")).toEqual([]);
    expect(n.update("evil", { content: "x", rev: "r" })).toEqual({ error: "not_found" });
    expect(n.trash("evil")).toEqual({ error: "not_found" });
  });
});

describe("list and search", () => {
  test("newest first, with a snippet from the start of the note", () => {
    n.create("Old", "# Old\n\nfirst words here"); n.create("New", "newest");
    utimesSync(join(dir, "Old.md"), new Date(2020, 1, 1), new Date(2020, 1, 1));
    expect(n.list().map((m) => m.id)).toEqual(["New", "Old"]);
    expect(n.list()[1].snippet).toBe("# Old first words here");
  });
  test("search finds by name or by text, ignores case, needs two characters, and shows the match", () => {
    n.create("Rome", "The Senate met on the Ides of March");
    n.create("Other", "nothing relevant");
    expect(n.search("ides").map((m) => m.id)).toEqual(["Rome"]);
    expect(n.search("ides")[0].snippet).toContain("Ides of March");
    expect(n.search("ROME").map((m) => m.id)).toEqual(["Rome"]);
    expect(n.search("r")).toEqual([]);
    expect(n.search("zzzz")).toEqual([]);
  });
});

describe("http: operator only", () => {
  type App = { request: (path: string, init?: RequestInit) => Promise<Response> };
  const opHeaders = { "content-type": "application/json", Origin: "http://127.0.0.1:4410", "Sec-Fetch-Site": "same-origin", Host: "127.0.0.1:4410" };
  test("no operator proof is 403 on every verb; the operator can create, edit with a revision, conflict, trash", async () => {
    const { app } = await import("../core/server") as unknown as { app: App };
    for (const [m, p] of [["GET", "/api/notes"], ["POST", "/api/notes"], ["GET", "/api/notes/X"], ["PUT", "/api/notes/X"], ["DELETE", "/api/notes/X"]] as const)
      expect((await app.request(p, { method: m, headers: { "content-type": "application/json", Host: "127.0.0.1:4410" }, body: m === "GET" || m === "DELETE" ? undefined : "{}" })).status).toBe(403);

    const name = `Http note ${crypto.randomUUID().slice(0, 8)}`, url = `/api/notes/${encodeURIComponent(name)}`;
    const mk = await app.request("/api/notes", { method: "POST", headers: opHeaders, body: JSON.stringify({ name, content: "hi" }) });
    expect(mk.status).toBe(201);
    const made = await mk.json() as { rev: string };
    const put = await app.request(url, { method: "PUT", headers: opHeaders, body: JSON.stringify({ content: "hello", rev: made.rev }) });
    expect(put.status).toBe(200);
    const stale = await app.request(url, { method: "PUT", headers: opHeaders, body: JSON.stringify({ content: "x", rev: made.rev }) });
    expect(stale.status).toBe(409);
    expect(((await stale.json()) as { current: { content: string } }).current.content).toBe("hello");
    expect((await app.request("/api/notes/..%2Fetc%2Fpasswd", { headers: opHeaders })).status).toBe(404);
    expect((await app.request(url, { method: "DELETE", headers: opHeaders })).status).toBe(200);
  });
});

describe("folders", () => {
  test("a note inside folders is created, listed, found, renamed and trashed; backlinks resolve by file name", () => {
    const { mkdtempSync, existsSync, readdirSync } = require("node:fs"); const { tmpdir } = require("node:os"); const { join } = require("node:path");
    const dir = mkdtempSync(join(tmpdir(), "notes-folders-"));
    const n = createNotes(dir);
    expect("note" in n.create("Plants/Garden", "Tomatoes #home")).toBe(true);
    expect("note" in n.create("Sessions/2026/Plan", "See [[Garden]] and [[Plants/Garden]]")).toBe(true);
    expect(n.list().map((m: { id: string }) => m.id).sort()).toEqual(["Plants/Garden", "Sessions/2026/Plan"]);
    expect(n.backlinks("Plants/Garden")).toEqual(["Sessions/2026/Plan"]);
    expect(n.search("tomatoes").map((m: { id: string }) => m.id)).toEqual(["Plants/Garden"]);
    const g = n.get("Plants/Garden")!;
    const r = n.update("Plants/Garden", { rev: g.rev, name: "Garden/Beds/Tomatoes" });
    expect("note" in r && r.note.id).toBe("Garden/Beds/Tomatoes");
    expect(n.get("Plants/Garden")).toBeNull();
    expect("ok" in n.trash("Garden/Beds/Tomatoes")).toBe(true);
    expect(readdirSync(join(dir, ".trash")).some((f: string) => f.startsWith("Garden__Beds__Tomatoes."))).toBe(true);
    // a hidden folder and a stray non-note file are never listed, and an escape is refused
    require("node:fs").mkdirSync(join(dir, ".obsidian")); require("node:fs").writeFileSync(join(dir, ".obsidian", "x.md"), "x"); require("node:fs").writeFileSync(join(dir, "notes.txt"), "x");
    expect(n.list().map((m: { id: string }) => m.id)).toEqual(["Sessions/2026/Plan"]);
    expect(n.create("../outside", "x")).toEqual({ error: "invalid_name" });
    expect(existsSync(join(dir, "..", "outside.md"))).toBe(false);
  });
});
