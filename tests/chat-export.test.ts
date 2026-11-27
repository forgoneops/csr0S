// A conversation saved to Notes: readable markdown, a safe file name, and never a write over an existing note.
import { describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";

// core/db fixes the data folder at import, so set it before anything imports core (effective when this file runs alone).
process.env.CAESAROS_DATA ??= mkdtempSync(join(tmpdir(), "caesaros-cx-"));
process.env.CAESAROS_MODULE_DIRS = "plugins";
const { baseName, chatExportRoutes, saveAsNote, toMarkdown } = await import("../core/chat-export");
const { appendMessage, createSession } = await import("../core/chat");
const { createNotes, validName } = await import("../core/notes");

const at = new Date(2026, 0, 5, 12).getTime();
const dir = () => mkdtempSync(join(tmpdir(), "caesaros-cxn-"));

describe("name", () => {
  test("hostile and odd titles become one valid segment", () => {
    for (const t of ["../../etc/passwd", "a/b\\c", "<img src=x onerror=alert(1)>", "...", "", "  .hidden", "x\u0000y\nz", "[[Link]] #tag", "𠜎".repeat(200), "x".repeat(500), "trail .. "]) {
      const name = baseName(t, at);
      expect(validName(name)).toBe(true);
      expect(name).not.toContain("/");
      expect(name.endsWith("2026-01-05")).toBe(true);
      expect(Buffer.byteLength(name)).toBeLessThan(200);
    }
    expect(baseName("Zażółć: plan?", at)).toBe("Zażółć plan 2026-01-05");
    expect(baseName("🙂🙂", at)).toBe("Conversation 2026-01-05");
  });
  test("a taken name gets a number and the old note is left as it was", () => {
    const d = dir(), store = createNotes(d);
    expect(saveAsNote(store, "Talk", "one")).toHaveProperty("note.id", "Chats/Talk");
    expect(saveAsNote(store, "Talk", "two")).toHaveProperty("note.id", "Chats/Talk (2)");
    expect(saveAsNote(store, "Talk", "three")).toHaveProperty("note.id", "Chats/Talk (3)");
    expect(readFileSync(join(d, "Chats", "Talk.md"), "utf8")).toBe("one");
    expect(readdirSync(join(d, "Chats")).length).toBe(3);
  });
});

describe("markdown", () => {
  const session = createSession({ engine: "echo", title: "Garden\nplan" });
  test("nothing said is null", () => expect(toMarkdown(session, [], "Echo")).toBeNull());
  test("turns in order, text kept as written, open fences closed, reasoning left out", () => {
    const u = appendMessage(session.id, { role: "user", content: "<b>hi</b>", attachments: [{ name: "a.txt", kind: "text", mime: "text/plain", size: 1, text: "SECRET-FILE-BODY" }] });
    const a = appendMessage(session.id, { role: "assistant", content: "```js\nlet x", status: "stopped", thinking: "PRIVATE-THOUGHT" });
    const f = appendMessage(session.id, { role: "assistant", content: "", status: "error", error: "engine\ndown" });
    const md = toMarkdown(session, [u, a, f], "Echo")!;
    expect(md.startsWith("# Garden plan\n\nConversation with Echo, started ")).toBe(true);
    expect(md).toContain("## You\n\n<b>hi</b>\n\nAttached: a.txt\n\n## Echo\n\n```js\nlet x\n```\n\n_(stopped before the end)_\n\n## Echo\n\n_(failed: engine down)_\n");
    expect(md).not.toContain("PRIVATE-THOUGHT");
    expect(md).not.toContain("SECRET-FILE-BODY");
  });
});

describe("routes", () => {
  const d = dir(), app = new Hono();
  chatExportRoutes(app, createNotes(d));
  const me = { headers: { "sec-fetch-site": "same-origin" } };
  test("save, save again, download, empty, missing, stranger", async () => {
    const s = createSession({ engine: "echo", title: "Route talk" });
    const url = (id: string, what: string) => `/api/chat/sessions/${id}/export/${what}`;
    expect((await app.request(url(s.id, "note"), { method: "POST", ...me })).status).toBe(409);
    expect((await app.request(url(s.id, "markdown"), me)).status).toBe(409);
    appendMessage(s.id, { role: "user", content: "hello" });
    const first = await app.request(url(s.id, "note"), { method: "POST", ...me });
    expect(first.status).toBe(201);
    const one = (await first.json() as { id: string }).id;
    const two = (await (await app.request(url(s.id, "note"), { method: "POST", ...me })).json() as { id: string }).id;
    expect(two).toBe(`${one} (2)`);
    const dl = await (await app.request(url(s.id, "markdown"), me)).json() as { filename: string; markdown: string };
    expect(dl.filename).toBe(`${one.slice("Chats/".length)}.md`);
    expect(dl.markdown).toBe(readFileSync(join(d, `${one}.md`), "utf8"));
    expect((await app.request(url("nope", "markdown"), me)).status).toBe(404);
    expect((await app.request(url(s.id, "note"), { method: "POST" })).status).toBe(403);
    expect((await app.request(url(s.id, "markdown"))).status).toBe(403);
  });
});
