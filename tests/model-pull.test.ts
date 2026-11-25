import { expect, test } from "bun:test";
import { createPuller, listInstalled } from "../core/model-pull";

const ndjson = (...l: object[]) => new Response(l.map((x) => JSON.stringify(x)).join("\n") + "\n");
test("a model outside the catalog is refused and nothing is fetched", () => {
  let called = false;
  const p = createPuller({ fetchImpl: (() => { called = true; return Promise.resolve(ndjson()); }) as never });
  expect(p.start("evil/model:latest")).toEqual({ ok: false, error: "not_in_catalog" });
  expect(called).toBe(false);
});
test("progress is read from Ollama and ends done", async () => {
  const p = createPuller({ baseUrl: () => "http://x", fetchImpl: (() => Promise.resolve(ndjson({ status: "pulling", total: 100, completed: 40 }, { status: "success" }))) as never });
  expect(p.start("llama3.2:1b")).toEqual({ ok: true });
  await Bun.sleep(30);
  expect(p.get()).toMatchObject({ model: "llama3.2:1b", done: true, total: 100, error: null });
});
test("an Ollama error line is shown, not swallowed", async () => {
  const p = createPuller({ baseUrl: () => "http://x", fetchImpl: (() => Promise.resolve(ndjson({ error: "disk full" }))) as never });
  p.start("llama3.2:1b"); await Bun.sleep(30);
  expect(p.get()).toMatchObject({ status: "failed", error: "disk full", done: true });
});
test("a second pull while one runs is refused", async () => {
  const p = createPuller({ fetchImpl: (() => new Promise(() => {})) as never });
  p.start("llama3.2:1b");
  expect(p.start("llama3.2:3b")).toEqual({ ok: false, error: "busy" });
  p.cancel();
});
test("installed models come from Ollama's list with sizes; unreachable means empty", async () => {
  const ok = (() => Promise.resolve(new Response(JSON.stringify({ models: [{ name: "a:1b", size: 2 * 1024 ** 3 }] })))) as never;
  expect(await listInstalled({ baseUrl: () => "http://x", fetchImpl: ok })).toEqual([{ name: "a:1b", sizeGb: 2 }]);
  expect(await listInstalled({ baseUrl: () => "http://x", fetchImpl: (() => Promise.reject(new Error("down"))) as never })).toEqual([]);
});
