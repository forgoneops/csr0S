import { test, expect } from "bun:test";
import { createThinkSplitter } from "../core/think-split";

const run = (chunks: string[]) => { const s = createThinkSplitter(); let text = "", thinking = ""; for (const c of [...chunks]) { const r = s.push(c); text += r.text; thinking += r.thinking; } const f = s.flush(); return { text: text + f.text, thinking: thinking + f.thinking }; };

test("splits answer and reasoning, whole or one character at a time", () => {
  const whole = "a<think>b</think>c";
  expect(run([whole])).toEqual({ text: "ac", thinking: "b" });
  expect(run(whole.split(""))).toEqual({ text: "ac", thinking: "b" });
});
test("a lone angle bracket or a half tag at the end is text, not lost", () => {
  expect(run(["1 < 2 and <thi"])).toEqual({ text: "1 < 2 and <thi", thinking: "" });
  expect(run(["<think>never closed"])).toEqual({ text: "", thinking: "never closed" });
});
test("several blocks and no blocks", () => {
  expect(run(["<think>x</think>y<think>z</think>w"])).toEqual({ text: "yw", thinking: "xz" });
  expect(run(["plain"])).toEqual({ text: "plain", thinking: "" });
});
