import { expect, test } from "bun:test";
import { createPuller, listInstalled } from "../core/model-pull";
import { CATALOG } from "../core/hardware";

const ndjson = (...l: object[]) => new Response(l.map((x) => JSON.stringify(x)).join("\n") + "\n");
test("a model outside the catalog is refused and nothing is fetched", () => {
  let called = false;
  const p = createPuller({ fetchImpl: (() => { called = true; return Promise.resolve(ndjson()); }) as never });
  expect(p.start("evil/model:latest")).toEqual({ ok: false, error: "not_in_catalog" });
  expect(called).toBe(false);
});
test("progress is read from Ollama and ends done", async () => {
  const p = createPuller({ baseUrl: () => "http://x", fetchImpl: (() => Promise.resolve(ndjson({ status: "pulling", total: 100, completed: 40 }, { status: "success" }))) as never });
  expect(p.start("llama3.2:1b")).toEqual({ ok: true, queued: false });
  await Bun.sleep(30);
  expect(p.get()).toMatchObject({ model: "llama3.2:1b", done: true, total: 100, error: null });
});
test("an Ollama error line is shown, not swallowed", async () => {
  const p = createPuller({ baseUrl: () => "http://x", fetchImpl: (() => Promise.resolve(ndjson({ error: "disk full" }))) as never });
  p.start("llama3.2:1b"); await Bun.sleep(30);
  expect(p.get()).toMatchObject({ status: "failed", error: "disk full", done: true });
});
test("a second model waits its turn, the same one twice is refused, and only catalog names get in line", async () => {
  const asked: string[] = []; const ends: (() => void)[] = [];
  const p = createPuller({ fetchImpl: ((_u: string, init: { body: string; signal: AbortSignal }) => { asked.push(JSON.parse(init.body).model); return new Promise((res, rej) => { ends.push(() => res(ndjson({ status: "success" }))); init.signal.addEventListener("abort", () => rej(new Error("aborted"))); }); }) as never });
  const [a, b, c] = CATALOG.map((m) => m.model) as [string, string, string];
  expect(p.start(a)).toEqual({ ok: true, queued: false });
  expect(p.start(a)).toEqual({ ok: false, error: "busy" });
  expect(p.start(b)).toEqual({ ok: true, queued: true });
  expect(p.start(b)).toEqual({ ok: false, error: "busy" });
  expect(p.start("evil/model")).toEqual({ ok: false, error: "not_in_catalog" });
  p.start(c); p.cancel(c);
  expect(p.get()).toMatchObject({ model: a, queue: [b] });
  ends[0]!(); await Bun.sleep(30);
  expect(p.get()).toMatchObject({ model: b, done: false, queue: [] });
  p.cancel(); await Bun.sleep(30);
  expect(p.get()).toMatchObject({ model: b, status: "cancelled", done: true, failed: [] });
  expect(asked).toEqual([a, b]);
});
test("a failed download does not stop the line, stays listed, and a retry clears it", async () => {
  let n = 0;
  const p = createPuller({ fetchImpl: (() => Promise.resolve(++n === 1 ? ndjson({ error: "disk full" }) : ndjson({ status: "success" }))) as never });
  const [a, b] = CATALOG.map((m) => m.model) as [string, string];
  p.start(a); p.start(b); await Bun.sleep(40);
  expect(p.get()).toMatchObject({ model: b, done: true, error: null, failed: [{ model: a, error: "disk full" }] });
  p.start(a); await Bun.sleep(30);
  expect(p.get()).toMatchObject({ model: a, done: true, failed: [] });
});
test("a failed model asked again while another runs waits in line and is no longer listed as failed", async () => {
  let n = 0;
  const p = createPuller({ fetchImpl: (() => (++n === 1 ? Promise.resolve(ndjson({ error: "reset" })) : new Promise(() => {}))) as never });
  const [a, b] = CATALOG.map((m) => m.model) as [string, string];
  p.start(a); p.start(b); await Bun.sleep(30);
  expect(p.get()).toMatchObject({ model: b, failed: [{ model: a }] });
  expect(p.start(a)).toEqual({ ok: true, queued: true });
  expect(p.get()).toMatchObject({ queue: [a], failed: [] });
  p.cancel(a); p.cancel();
});
test("installed models come from Ollama's list with sizes; unreachable means empty", async () => {
  const ok = (() => Promise.resolve(new Response(JSON.stringify({ models: [{ name: "a:1b", size: 2 * 1024 ** 3 }] })))) as never;
  expect(await listInstalled({ baseUrl: () => "http://x", fetchImpl: ok })).toEqual([{ name: "a:1b", sizeGb: 2 }]);
  expect(await listInstalled({ baseUrl: () => "http://x", fetchImpl: (() => Promise.reject(new Error("down"))) as never })).toEqual([]);
});
