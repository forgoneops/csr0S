// The weekly limits of the coding tools, as the tools report them (Omarchy's agent usage records); nothing is guessed.
import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { toolLimits } from "../core/usage";

const NOW = Date.parse("2026-11-23T12:00:00Z"), dir = () => mkdtempSync(join(tmpdir(), "lim-"));
const put = (d: string, id: string, o: object) => writeFileSync(join(d, `${id}.json`), JSON.stringify(o));
const codex = (extra: object = {}) => ({ id: "codex", name: "Codex", updatedAt: "2026-11-23T11:58:00+00:00", ready: true, limitsStale: false, limits: [{ label: "5h window", percent: 12, resetsAt: "2026-11-23T14:00:00+00:00" }, { label: "Weekly (7-day)", percent: 41.5, resetsAt: "2026-11-23T19:26:00+00:00" }], ...extra });

test("a fresh record gives the weekly bar and the time to the reset", () => {
  const d = dir(); put(d, "codex", codex());
  const c = toolLimits({ dir: d, now: NOW }).find((x) => x.id === "codex")!;
  expect(c).toMatchObject({ name: "Codex", state: "ok", weekly: { percent: 41.5, resetInMs: 7 * 36e5 + 26 * 6e4 } });
});
test("no file, no limits or a broken file says there is no record; nothing is invented", () => {
  const d = dir(); put(d, "hermes", { id: "hermes", name: "Hermes", updatedAt: "2026-11-23T11:59:00+00:00", limits: [] }); writeFileSync(join(d, "claude.json"), "{not json");
  const all = toolLimits({ dir: d, now: NOW });
  expect(all.map((x) => [x.id, x.state])).toEqual([["codex", "none"], ["claude", "none"], ["hermes", "none"]]);
  expect(all.every((x) => x.weekly === undefined)).toBe(true);
  expect(toolLimits({ dir: join(d, "missing"), now: NOW }).every((x) => x.state === "none")).toBe(true);
});
test("an old record is shown as stale, and so is one the tool itself marks stale", () => {
  const a = dir(); put(a, "codex", codex({ updatedAt: "2026-11-23T09:00:00+00:00" }));
  const b = dir(); put(b, "codex", codex({ limitsStale: true }));
  for (const d of [a, b]) { const c = toolLimits({ dir: d, now: NOW })[0]!; expect(c.state).toBe("stale"); expect(c.weekly?.percent).toBe(41.5); }
});
test("a window whose reset has passed shows no countdown, and percentages stay inside 0 to 100", () => {
  const d = dir(); put(d, "codex", codex({ limits: [{ label: "Weekly (7-day)", percent: 140, resetsAt: "2026-11-23T10:00:00+00:00" }] }));
  const w = toolLimits({ dir: d, now: NOW })[0]!.weekly!;
  expect(w.percent).toBe(100); expect(w.resetInMs).toBe(0);
});
test("a record with only a session window and no weekly one still has a state and no weekly bar", () => {
  const d = dir(); put(d, "claude", { id: "claude", name: "Claude Code", updatedAt: "2026-11-23T11:59:00+00:00", limits: [{ label: "Session (5-hour)", percent: 3, resetsAt: "2026-11-23T15:00:00+00:00" }] });
  const c = toolLimits({ dir: d, now: NOW }).find((x) => x.id === "claude")!;
  expect(c.state).toBe("ok"); expect(c.weekly).toBeUndefined(); expect(c.session?.percent).toBe(3);
});
