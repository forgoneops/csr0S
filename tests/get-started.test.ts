// Get started: ticks follow the real counts, unknown never counts as done, and the route reads live core state.
import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { getStartedApi, tickSteps, type Facts } from "../core/getstarted";
import { createBackup, listBackups } from "../core/backup";
import { appendMessage, createSession } from "../core/chat";
import { db } from "../core/db";

const none: Facts = { engine: 0, model: 0, chat: 0, note: 0, device: 0, backup: 0 };

describe("get started ticks", () => {
  test("nothing there, nothing ticked", () => {
    const r = tickSteps(none);
    expect(r.steps.map((s) => s.done)).toEqual([false, false, false, false, false, false]);
    expect(r).toMatchObject({ done: 0, total: 6, allDone: false });
  });
  test("a count above zero ticks only its own step", () => {
    const r = tickSteps({ ...none, note: 3 });
    expect(r.steps.filter((s) => s.done).map((s) => s.id)).toEqual(["note"]);
  });
  test("unknown is neither done nor to do, and blocks all-done", () => {
    const r = tickSteps({ engine: 1, model: null, chat: 1, note: 1, device: 1, backup: 1 });
    expect(r.steps[1]).toEqual({ id: "model", done: null });
    expect(r).toMatchObject({ done: 5, allDone: false });
  });
  test("all six counted is all done", () => {
    expect(tickSteps({ engine: 1, model: 2, chat: 1, note: 1, device: 1, backup: 1 }).allDone).toBe(true);
  });
});

describe("get started route", () => {
  const app = new Hono(); let operator = true;
  getStartedApi(app, () => operator);
  const read = async () => (await app.request("/api/get-started")).json() as Promise<{ dismissed: boolean; steps: { id: string; done: boolean | null }[] }>;
  const put = (body: unknown) => app.request("/api/get-started", { method: "PUT", body: JSON.stringify(body) });

  test("the backup tick follows the backup folder", async () => {
    createBackup();
    expect(listBackups().length).toBeGreaterThan(0);
    expect((await read()).steps.find((s) => s.id === "backup")!.done).toBe(true);
  });
  test("the chat tick needs a message the person sent, not just a reply", async () => {
    const chat = async () => (await read()).steps.find((s) => s.id === "chat")!.done;
    db.run("DELETE FROM chat_messages");   // one test process shares one database, other files leave messages behind
    const { id } = createSession({ engine: "x" });
    appendMessage(id, { role: "assistant", content: "hello" });
    expect(await chat()).toBe(false);
    appendMessage(id, { role: "user", content: "hi" });
    expect(await chat()).toBe(true);
  });
  test("dismiss is saved and can be undone; bad bodies and strangers are refused", async () => {
    expect((await put({ dismissed: true })).status).toBe(200);
    expect((await read()).dismissed).toBe(true);
    await put({ dismissed: false });
    expect((await read()).dismissed).toBe(false);
    expect((await put({ dismissed: "yes" })).status).toBe(400);
    operator = false;
    expect((await put({ dismissed: true })).status).toBe(403);
  });
});
