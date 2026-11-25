import { expect, test } from "bun:test";
import { createCliEngine } from "../core/engines/cli";

const spec = { id: "claude", args: ["-p"] };
test("health says not detected when the tool is not on the walked directories", async () => {
  const e = createCliEngine(spec, { dirs: ["/nonexistent-dir"] });
  expect(await e.health()).toEqual({ ok: false, detail: "not detected" });
});
test("stream refuses when the tool is missing and never spawns", async () => {
  let spawned = false;
  const e = createCliEngine(spec, { dirs: ["/nonexistent-dir"], spawn: (() => { spawned = true; }) as never });
  await expect((async () => { for await (const _ of e.stream([{ role: "user", content: "hi" }], { model: "default" })) { /* drain */ } })()).rejects.toThrow("not installed");
  expect(spawned).toBe(false);
});
