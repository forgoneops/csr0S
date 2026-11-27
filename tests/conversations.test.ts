// The conversation list: pinning is saved by the core without moving a chat in time, and days are grouped by the calendar.
import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.CAESAROS_DATA ??= mkdtempSync(join(tmpdir(), "caesaros-cv-"));
process.env.CAESAROS_MODULE_DIRS = "plugins";
const { chatApi, createSession, getSession } = await import("../core/chat");

describe("pins", () => {
  test("pin and unpin are saved, and the time of the chat does not move", async () => {
    const api = chatApi(), s = createSession({ engine: "echo", title: "Keep me" });
    const patch = (body: unknown) => api.request(`/sessions/${s.id}`, { method: "PATCH", body: JSON.stringify(body) });
    expect(s.pinned).toBe(false);
    expect(await (await patch({ pinned: true })).json()).toMatchObject({ pinned: true, title: "Keep me", updatedAt: s.updatedAt });
    expect(getSession(s.id)!.session.pinned).toBe(true);
    expect(await (await patch({ pinned: false })).json()).toMatchObject({ pinned: false });
    expect((await patch({ pinned: "yes" })).status).toBe(400);
  });
});

describe("date groups", () => {
  const src = readFileSync(join(import.meta.dir, "..", "web", "atrium", "conversations.js"), "utf8");
  const body = src.slice(src.indexOf("  function groupOf"), src.indexOf("  const GROUPS"));
  const groupOf = new Function(`${body}; return groupOf;`)() as (s: { pinned?: boolean; updatedAt: number }, now: number) => string;
  const now = new Date(2026, 5, 15, 0, 30).getTime(), at = (day: number, h = 23) => ({ updatedAt: new Date(2026, 5, day, h).getTime() });
  test("calendar days, not 24 hour blocks; pinned wins", () => {
    expect(groupOf(at(15, 0), now)).toBe("Today");
    expect(groupOf(at(14), now)).toBe("Yesterday");
    expect(groupOf(at(8), now)).toBe("Previous 7 days");
    expect(groupOf(at(7), now)).toBe("Previous 30 days");
    expect(groupOf({ updatedAt: new Date(2026, 3, 1).getTime() }, now)).toBe("Older");
    expect(groupOf({ ...at(1), pinned: true }, now)).toBe("Pinned");
  });
});
