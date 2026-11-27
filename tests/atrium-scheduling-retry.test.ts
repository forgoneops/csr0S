// Without Hermes the jobs call fails. The page must show the error once and wait for Refresh, not ask again on every redraw.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("a failed load of the scheduled tasks is not retried until the person asks", async () => {
  const js = readFileSync(join(import.meta.dir, "..", "web", "atrium", "scheduling.js"), "utf8");
  let calls = 0, html = ""; const on: Record<string, (e: unknown) => unknown> = {};
  const OG: Record<string, () => string> = {}, win: { render?: () => void } = {};
  const draw = () => { if (calls < 20) html = OG.Scheduling(); };          // the cap keeps a regression from looping for ever
  win.render = draw;
  const fetch = async () => { calls++; return { ok: false, status: 502, json: async () => ({ error: "Hermes is not installed." }) }; };
  new Function("window", "document", "OG", "fetch", "render", js)(win, { addEventListener: (k: string, f: (e: unknown) => unknown) => { on[k] = f; } }, OG, fetch, draw);
  draw(); await Bun.sleep(30);
  expect(calls).toBe(1);
  expect(html).toContain("Hermes is not installed.");
  await on.click({ target: { closest: () => ({ dataset: { sched: "refresh" } }) } }); await Bun.sleep(30);
  expect(calls).toBe(2);
});
