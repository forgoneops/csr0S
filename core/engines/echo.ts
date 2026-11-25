// A scripted engine for tests and for the readiness pass: it answers "echo: <last message>" a few words at a time, slowly enough to
// press Stop or send a second message. Registered only when CAESAROS_TEST_ENGINE=1, so no real install ever offers it. Local by nature.
import type { EngineAdapter, EngineEvent } from "./types";

export function createEchoEngine(opts: { delayMs?: number } = {}): EngineAdapter {
  const delay = opts.delayMs ?? Number(process.env.CAESAROS_ECHO_DELAY_MS ?? 250);
  return {
    id: "echo",
    label: "Echo (test)",
    scope: () => "local",
    async health() { return { ok: true, detail: null }; },
    async models() { return [{ id: "echo", label: "Echo" }]; },
    async *stream(messages, { signal }): AsyncIterable<EngineEvent> {
      const last = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
      const words = `echo: ${last}`.split(/\s+/);
      for (const w of words) {
        if (signal?.aborted) return;
        await new Promise((r) => setTimeout(r, delay));
        if (signal?.aborted) return;
        yield { type: "delta", text: w + " " };
      }
      yield { type: "done" };
    },
  };
}
