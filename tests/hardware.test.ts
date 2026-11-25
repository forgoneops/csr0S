import { expect, test } from "bun:test";
import { advise, readMachine, type Machine } from "../core/hardware";

const m = (ramGb: number, freeDiskGb = 200): Machine => ({ ramGb, cores: 8, freeDiskGb, gpu: "none", os: "linux" });
test("a small machine gets only the smallest tier", () => {
  expect(advise(m(4)).map((a) => a.tier)).toEqual(["quick"]);
});
test("a 16 GB machine gets quick, balanced and max, none larger than it holds", () => {
  const a = advise(m(16));
  expect(a.map((x) => x.tier)).toEqual(["quick", "balanced", "max"]);
  expect(a[2]!.model).toBe("llama3.1:8b");
});
test("a full disk removes the models that would not fit twice over", () => {
  expect(advise(m(64, 3)).map((a) => a.model)).toEqual(["llama3.2:1b"]);
});
test("nothing fits under 4 GB of RAM", () => { expect(advise(m(2))).toEqual([]); });
test("the reader returns real numbers on this machine", () => {
  const r = readMachine(process.cwd());
  expect(r.ramGb).toBeGreaterThan(0); expect(r.cores).toBeGreaterThan(0);
});
