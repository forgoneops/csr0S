import { expect, test } from "bun:test";
import { db } from "../core/db";
import { createSession, appendMessage } from "../core/chat";
import { recentFailures, recentTools, toolStats, usage } from "../core/usage";

test("answers are counted per engine, today and this week, with errors apart", () => {
  const s = createSession({ engine: "usage-test-engine" });
  appendMessage(s.id, { role: "user", content: "hi", status: "complete" });
  appendMessage(s.id, { id: crypto.randomUUID(), role: "assistant", content: "a", status: "complete" });
  appendMessage(s.id, { id: crypto.randomUUID(), role: "assistant", content: "", status: "error", error: "x" });
  const row = usage().find((u) => u.engine === "usage-test-engine")!;
  expect(row).toEqual({ engine: "usage-test-engine", today: 2, week: 2, errors: 1 });
  // an answer from eight days ago is not in the week
  db.query("UPDATE chat_messages SET created_at = ? WHERE session_id = ? AND status = 'error'").run(Date.now() - 8 * 86400000, s.id);
  expect(usage().find((u) => u.engine === "usage-test-engine")).toEqual({ engine: "usage-test-engine", today: 1, week: 1, errors: 0 });
  db.query("DELETE FROM chat_messages WHERE session_id = ?").run(s.id); db.query("DELETE FROM chat_sessions WHERE id = ?").run(s.id);
});

test("a failed answer shows up as a recent failure with its error", () => {
  const s = createSession({ engine: "fail-test-engine" });
  appendMessage(s.id, { id: crypto.randomUUID(), role: "assistant", content: "", status: "error", error: "engine stopped" });
  expect(recentFailures().find((f) => f.engine === "fail-test-engine")).toMatchObject({ error: "engine stopped", session: s.id });
  db.query("DELETE FROM chat_messages WHERE session_id = ?").run(s.id); db.query("DELETE FROM chat_sessions WHERE id = ?").run(s.id);
});

test("tool calls in replies are grouped by tool with counts, failures and the average time", () => {
  const s = createSession({ engine: "tool-test-engine" });
  appendMessage(s.id, { id: crypto.randomUUID(), role: "assistant", content: "ok", status: "complete", tools: [{ id: "1", name: "zz_read", status: "ok", ms: 100 }, { id: "2", name: "zz_read", status: "error", ms: 300 }, { id: "3", name: "zz_write", status: "ok" }] as never });
  const read = toolStats().find((x) => x.name === "zz_read")!;
  expect(read).toEqual({ name: "zz_read", calls: 2, errors: 1, avgMs: 200 });
  expect(toolStats().find((x) => x.name === "zz_write")).toEqual({ name: "zz_write", calls: 1, errors: 0, avgMs: null });
  db.query("DELETE FROM chat_messages WHERE session_id = ?").run(s.id); db.query("DELETE FROM chat_sessions WHERE id = ?").run(s.id);
});

test("the newest tool calls come back with the engine that made them, newest first", () => {
  const s = createSession({ engine: "recent-test-engine" });
  appendMessage(s.id, { id: crypto.randomUUID(), role: "assistant", content: "a", status: "complete", tools: [{ id: "1", name: "first_tool", status: "ok", ms: 10 }, { id: "2", name: "second_tool", status: "error", ms: 20 }] as never });
  const mine = recentTools(50).filter((x) => x.engine === "recent-test-engine");
  expect(mine.map((x) => x.name)).toEqual(["second_tool", "first_tool"]);
  expect(mine[0]).toMatchObject({ status: "error", ms: 20 });
  db.query("DELETE FROM chat_messages WHERE session_id = ?").run(s.id); db.query("DELETE FROM chat_sessions WHERE id = ?").run(s.id);
});
