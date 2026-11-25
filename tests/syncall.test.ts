import { expect, test } from "bun:test";
import { roundOk, syncAll } from "../core/syncall";

test("a round is ok only when nothing in it failed", () => {
  expect(roundOk([{ id: "a", notes: { sent: 2 }, chats: { sent: 0 } }])).toBe(true);
  expect(roundOk([{ id: "a", notes: { sent: 2 }, chats: { error: "unreachable" } }])).toBe(false);
  expect(roundOk([])).toBe(true);
});
test("with nothing switched on the round says what to do and is recorded", async () => {
  const r = await syncAll(123);
  expect(r.devices).toEqual([]); expect(r.note).toContain("Switch sync on"); expect(r.at).toBe(123); expect(r.ok).toBe(true);
});
