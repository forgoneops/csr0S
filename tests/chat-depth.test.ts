// Conversations can be renamed and deleted; a bad title is refused and an unknown id is 404.
import { describe, expect, test } from "bun:test";

type App = { request: (path: string, init?: RequestInit) => Promise<Response> };
const j = (method: string, body?: unknown): RequestInit => ({ method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

describe("chat sessions: rename and delete", () => {
  test("round trip", async () => {
    const { mkdtempSync } = await import("node:fs"), { tmpdir } = await import("node:os"), { join } = await import("node:path");
    process.env.CAESAROS_DATA = mkdtempSync(join(tmpdir(), "caesaros-cd-"));
    process.env.CAESAROS_MODULE_DIRS = "plugins";
    const { app } = await import("../core/server") as unknown as { app: App };
    const base = "/api/p/chat/sessions".replace("/p/chat", "/chat");

    // the database is shared with the other test files in this process, so count relative to the start
    const count = async () => ((await (await app.request(base)).json()) as unknown[]).length;
    const before = await count();
    const made = await (await app.request(base, j("POST", { engine: "ollama" }))).json() as { id: string };
    expect(await count()).toBe(before + 1);

    expect((await app.request(`${base}/${made.id}`, j("PATCH", { title: "   " }))).status).toBe(400);
    const renamed = await app.request(`${base}/${made.id}`, j("PATCH", { title: "  Plan for Rome  " }));
    expect(renamed.status).toBe(200);
    expect(((await renamed.json()) as { title: string }).title).toBe("Plan for Rome");
    expect((await app.request(`${base}/nope`, j("PATCH", { title: "x" }))).status).toBe(404);

    expect((await app.request(`${base}/${made.id}`, j("DELETE"))).status).toBe(200);
    expect((await app.request(`${base}/${made.id}`)).status).toBe(404);
    expect(await count()).toBe(before);
    expect((await app.request(`${base}/${made.id}`, j("DELETE"))).status).toBe(404);
  });
});
