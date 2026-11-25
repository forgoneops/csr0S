import { expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { appendMessage, createSession, getSession, listSessions } from "../core/chat";
import { applyChats, changedChats, open, seal } from "../core/chatsync";
import { newCode, redeem } from "../core/pairing";
import { db, kv } from "../core/db";

const key = () => randomBytes(32).toString("base64");

test("a sealed value opens only with the same key, and a changed byte is refused", () => {
  const k = key(), s = seal(k, [{ a: 1 }]);
  expect(open(k, s)).toEqual([{ a: 1 }]);
  expect(open(key(), s)).toBeNull();
  const b = Buffer.from(s, "base64"); b[b.length - 1] ^= 1;
  expect(open(k, b.toString("base64"))).toBeNull();
  expect(open(k, "not base64 at all")).toBeNull();
});

test("the sealed text does not contain the conversation", () => {
  const s = Buffer.from(seal(key(), [{ content: "my secret plan" }]), "base64").toString("latin1");
  expect(s).not.toContain("secret");
});

test("a conversation from another device arrives as a copy, later messages are appended once, and nothing is overwritten", () => {
  const wire = (msgs: string[]) => [{ id: "remote-1", title: "Plan", engine: "e", messages: msgs.map((c, i) => ({ id: "m" + i, role: i % 2 ? "assistant" : "user", content: c, status: "complete", at: i })) }];
  const before = listSessions().length;
  expect(applyChats("dev-x", "Phone", wire(["hi", "hello"]))).toEqual({ sessions: 1, messages: 2 });
  expect(applyChats("dev-x", "Phone", wire(["hi", "hello", "more"]))).toEqual({ sessions: 0, messages: 1 });
  expect(applyChats("dev-x", "Phone", wire(["hi", "hello", "more"]))).toEqual({ sessions: 0, messages: 0 });
  const mine = listSessions().filter((s) => s.title === "Plan (via Phone)");
  expect(mine.length).toBe(1); expect(listSessions().length).toBe(before + 1);
  expect(getSession(mine[0]!.id)!.messages.map((m) => m.content)).toEqual(["hi", "hello", "more"]);
  expect(applyChats("dev-x", "Phone", [{ id: "loop", title: "Plan (via Phone)", engine: "e", messages: [{ id: "z", role: "user", content: "x", status: "complete", at: 1 }] }])).toEqual({ sessions: 0, messages: 0 });
  for (const s of mine) { db.query("DELETE FROM chat_messages WHERE session_id = ?").run(s.id); db.query("DELETE FROM chat_sessions WHERE id = ?").run(s.id); }
});

test("only role, text, status and time leave the device, and copies from other devices are not sent back", () => {
  const s = createSession({ title: "Mine", engine: "e" });
  appendMessage(s.id, { role: "assistant", content: "answer", thinking: "private thoughts", tools: [{ id: "t", name: "terminal", status: "ok", output: "secret output" }] });
  const copy = createSession({ title: "Other (via Phone)", engine: "e" }); appendMessage(copy.id, { role: "user", content: "x" });
  const out = changedChats(0), mine = out.find((w) => w.id === s.id)!;
  expect(JSON.stringify(mine)).not.toContain("private thoughts"); expect(JSON.stringify(mine)).not.toContain("secret output");
  expect(mine.messages[0]).toEqual({ id: expect.any(String), role: "assistant", content: "answer", status: "complete", at: expect.any(Number) });
  expect(out.some((w) => w.id === copy.id)).toBe(false);
  for (const id of [s.id, copy.id]) { db.query("DELETE FROM chat_messages WHERE session_id = ?").run(id); db.query("DELETE FROM chat_sessions WHERE id = ?").run(id); }
});

test("pairing makes a 32-byte conversation key for the new device", () => {
  const was = kv("pairing").get<unknown>("state", { visible: false, discover: false, devices: [] });
  kv("pairing").set("state", { visible: true, discover: false, devices: [] });
  try {
    const c = newCode(); if (!("code" in c)) throw new Error("no code");
    const r = redeem(c.code, "Laptop");
    expect(r.ok).toBe(true);
    if (r.ok) { expect(Buffer.from(r.syncKey!, "base64").length).toBe(32); expect(r.device.syncKey).toBe(r.syncKey); }
  } finally { kv("pairing").set("state", was); }
});
