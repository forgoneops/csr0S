import { expect, test } from "bun:test";
import { createEchoEngine } from "../core/engines/echo";

const run = async (it: AsyncIterable<{ type: string; text?: string }>) => { let s = ""; for await (const e of it) if (e.type === "delta") s += e.text; return s.trim(); };

test("echo answers with the last user message, word by word", async () => {
  const e = createEchoEngine({ delayMs: 1 });
  expect(await run(e.stream([{ role: "user", content: "hello world" }], { model: "echo" }))).toBe("echo: hello world");
  expect((await e.health()).ok).toBe(true);
});
test("echo stops at once when aborted", async () => {
  const e = createEchoEngine({ delayMs: 20 }), ac = new AbortController();
  const p = run(e.stream([{ role: "user", content: "a b c d e f g h" }], { model: "echo", signal: ac.signal }));
  setTimeout(() => ac.abort(), 50);
  expect((await p).split(" ").length).toBeLessThan(6);
});
test("echo is local, so Local only never skips it", () => { expect(createEchoEngine().scope?.()).toBe("local"); });
