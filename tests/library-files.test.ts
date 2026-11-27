import { expect, test } from "bun:test";
import { Hono } from "hono";
import { libraryFilesApi, parseName } from "../core/library-files";

test("only the formats the Library keeps are accepted, named by their clean title", () => {
  expect(parseName("Deck.v2.PPTX")).toEqual({ name: "Deck.v2", ext: "pptx" });
  expect(parseName("../../etc/Guide.pdf")).toEqual({ name: "Guide", ext: "pdf" });
  expect(parseName("run.exe")).toBeNull();
  expect(parseName("noext")).toBeNull();
});

test("a file is kept, listed, trashed, restored and only then deleted for good", async () => {
  const app = new Hono(); libraryFilesApi(app);
  const add = await app.request("/api/library/files?name=Notes.odp", { method: "POST", body: new Uint8Array([1, 2, 3]) });
  expect(add.status).toBe(201);
  const { id, kind } = await add.json() as { id: string; kind: string };
  expect(kind).toBe("deck");
  expect((await app.request("/api/library/files?name=x.exe", { method: "POST", body: "x" })).status).toBe(400);
  const ids = async () => ((await (await app.request("/api/library/files")).json()) as { id: string }[]).map((f) => f.id);
  expect(await ids()).toContain(id);
  expect((await app.request(`/api/library/files/${id}`, { method: "DELETE" })).status).toBe(409);   // not in the trash yet
  await app.request(`/api/library/files/${id}/trash`, { method: "POST" });
  expect(await ids()).not.toContain(id);
  await app.request(`/api/library/files/${id}/restore`, { method: "POST" });
  await app.request(`/api/library/files/${id}/trash`, { method: "POST" });
  expect((await app.request(`/api/library/files/${id}`, { method: "DELETE" })).status).toBe(200);
  expect((await app.request(`/api/library/files/${id}/raw`)).status).toBe(404);
});
