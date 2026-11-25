import { describe, expect, test } from "bun:test";
import { parentGone, watchParent } from "../core/parent-watch";

describe("parent watch", () => {
  test("this process is alive; a pid that cannot exist is gone", () => {
    expect(parentGone(process.pid)).toBe(false);
    expect(parentGone(2 ** 22 + 12345)).toBe(true);
  });
  test("no variable, junk and pid 0 or 1 are never watched", () => {
    for (const pid of [undefined, "", "abc", "0", "1", "-5", "1.5"]) expect(watchParent({ pid, onGone: () => {} })).toBeNull();
  });
  test("it fires once when the parent disappears, and not before", async () => {
    let alive = true, fired = 0;
    const t = watchParent({ pid: "4242", intervalMs: 10, gone: () => !alive, onGone: () => { fired++; } })!;
    await Bun.sleep(40); expect(fired).toBe(0);
    alive = false; await Bun.sleep(60); expect(fired).toBe(1);
    await Bun.sleep(40); expect(fired).toBe(1);     // the timer is cleared: no second call
    clearInterval(t);
  });
  test("a real child process really is noticed: kill the parent, the watcher sees it", async () => {
    const parent = Bun.spawn(["sleep", "30"]);
    let fired = false;
    const t = watchParent({ pid: String(parent.pid), intervalMs: 20, onGone: () => { fired = true; } })!;
    await Bun.sleep(60); expect(fired).toBe(false);
    parent.kill(); await parent.exited; await Bun.sleep(80);
    expect(fired).toBe(true); clearInterval(t);
  });
});
