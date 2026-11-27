// The Updates page of pg-sys.js never reloads on its own.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("Updates: Apply stays off until a check finds a new build, and reloads only after the confirm", async () => {
  let views: Record<string, () => string> = {};
  let click: (e: unknown) => void = () => {};
  let build = "aaa", reloads = 0;
  const stub = () => "";
  const S = { again: () => {}, HL: { d: { det: { engines: [] }, ver: { version: "1", build: "aaa" } } } };
  new Function("window", "OG", "OGE", "ogHead", "vzEmpty", "vzTiles", "vzTile", "vzSeg", "vzBars", "vzStack", "ARTSTATE", "fetch", "document", "register", "location",
    readFileSync(join(import.meta.dir, "..", "web", "atrium", "pg-sys.js"), "utf8"))(
    { xSys: S }, {}, String, stub, stub, stub, stub, stub, stub, stub, stub, async () => ({ ok: true, json: async () => ({ version: "1", build }) }),
    { addEventListener: (_: string, f: typeof click) => { click = f; } }, (m: { views: typeof views }) => { views = m.views; }, { reload: () => { reloads++; } });
  const press = async (k: string) => { click({ target: { closest: () => ({ dataset: { ps: k } }) } }); await new Promise((r) => setTimeout(r, 5)); };
  await new Promise((r) => setTimeout(r, 5));

  await press("check");
  expect(views.Updates!()).toContain('data-ps="apply" disabled');
  build = "bbb";
  await press("check");
  await press("apply");
  expect(reloads).toBe(0);
  expect(views.Updates!()).toContain("Confirm: reload now");
  await press("applygo");
  expect(reloads).toBe(1);
});
