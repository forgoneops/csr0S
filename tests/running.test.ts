import { expect, test } from "bun:test";
import { running } from "../core/running";

test("stopAll calls every stop once, survives one that throws, and empties the list", () => {
  let a = 0, b = 0;
  running.add("a", () => { a++; }); running.add("bad", () => { throw new Error("x"); }); running.add("b", () => { b++; });
  expect(running.count()).toBe(3);
  expect(running.stopAll()).toBe(3);
  expect([a, b, running.count()]).toEqual([1, 1, 0]);
});
test("a finished job removes itself", () => { running.add("x", () => {}); running.remove("x"); expect(running.count()).toBe(0); });
