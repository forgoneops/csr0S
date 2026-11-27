import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { swrFor } from "../core/memo";

const web = (f: string) => readFileSync(join(import.meta.dir, "..", "web", "atrium", f), "utf8");

test("swrFor: the first call waits, later calls answer at once with the last value while it refreshes", async () => {
  let n = 0;
  const get = swrFor(5, async () => { await Bun.sleep(20); return ++n; });
  expect(await get()).toBe(1);
  await Bun.sleep(10);
  expect(await get()).toBe(1);   // stale, not blocked; this call starts the refresh
  await Bun.sleep(60);
  expect(await get()).toBe(2);   // the background refresh landed
});

test("swrFor: a failing refresh keeps the stale value and a failing first call rejects", async () => {
  let fail = false;
  const get = swrFor(1, async () => { if (fail) throw new Error("down"); return "ok"; });
  expect(await get()).toBe("ok");
  fail = true;
  await Bun.sleep(2);
  expect(await get()).toBe("ok");
  const bad = swrFor(0, async () => { throw new Error("down"); });
  await expect(bad()).rejects.toThrow("down");
});

test("the date picker ships: loaded by the page and cached by the service worker, no stock date input left", () => {
  expect(web("index.html")).toContain('src="datepick.js"');
  expect(web("sw.js")).toContain('"/datepick.js"');
  expect(web("real.js")).not.toContain('type="date"');
});

test("the neutral theme pins its palette over an inline ember pack colour", () => {
  expect(web("theme-neutral.css")).toContain("--p1:#5fd6d1!important");
});

test("the tab strip keeps Terminal and Split outside the scrolling area", () => {
  const h = web("index.html");
  expect(h).toContain('class="nx-tscroll"');
  expect(h.indexOf('class="nx-tpin"')).toBeGreaterThan(h.indexOf("data-nx=\"pal\""));
});
