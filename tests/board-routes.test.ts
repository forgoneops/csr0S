// The Board's routes as board.js uses them: add, read, edit, move, delete, and the refusals.
import { describe, expect, test } from "bun:test";

const { app } = await import("../core/server") as unknown as { app: { request: (path: string, init?: RequestInit) => Promise<Response> } };
const J = { "content-type": "application/json" };
const write = (path: string, method: string, body: unknown) => app.request(path, { method, headers: J, body: JSON.stringify(body) });
type Task = { id: string; title: string; note: string; status: string };

describe("Board routes", () => {
  test("a card is added, edited, moved and deleted", async () => {
    const created = await write("/api/board", "POST", { title: "  Check the lanes  " });
    expect(created.status).toBe(201);
    const t = await created.json() as Task;
    expect(t.title).toBe("Check the lanes"); expect(t.status).toBe("todo"); expect(t.note).toBe("");

    const edited = await write("/api/board/" + t.id, "PUT", { note: "a note" });
    expect(edited.status).toBe(200);
    expect(await edited.json() as Task).toMatchObject({ title: "Check the lanes", note: "a note", status: "todo" });

    const moved = await write("/api/board/" + t.id, "PUT", { status: "doing" });
    expect((await moved.json() as Task).status).toBe("doing");

    const list = await (await app.request("/api/board")).json() as Task[];
    expect(list.find(x => x.id === t.id)?.status).toBe("doing");

    expect((await app.request("/api/board/" + t.id, { method: "DELETE" })).status).toBe(200);
    expect((await app.request("/api/board/" + t.id, { method: "DELETE" })).status).toBe(404);
  });

  test("a card without a title is refused and an unknown id is not found", async () => {
    const empty = await write("/api/board", "POST", { title: "   " });
    expect(empty.status).toBe(400); expect(await empty.json()).toEqual({ error: "title" });
    const missing = await write("/api/board/missing", "PUT", { status: "done" });
    expect(missing.status).toBe(404); expect(await missing.json()).toEqual({ error: "not_found" });
  });
});
