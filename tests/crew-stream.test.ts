import { expect, test } from "bun:test";
import { streamLine, stripMemoryTail } from "../core/crew";

test("text becomes a delta, a tool_use opens a running row and the tool_result closes it with Hermes' own time", () => {
  expect(streamLine(JSON.stringify({ type: "text", text: "Hello" }))).toEqual([{ type: "delta", text: "Hello" }]);
  const open = streamLine(JSON.stringify({ type: "tool_use", name: "terminal", tool_call_id: "c1", input: { command: "ls" } }));
  expect(open).toEqual([{ type: "tool", call: { id: "c1", name: "terminal", status: "running", input: '{"command":"ls"}' } }]);
  const done = streamLine(JSON.stringify({ type: "tool_result", name: "terminal", tool_call_id: "c1", output: "ok", duration_ms: 204, is_error: false }));
  expect(done).toEqual([{ type: "tool", call: { id: "c1", name: "terminal", status: "ok", output: "ok", ms: 204 } }]);
  expect((streamLine(JSON.stringify({ type: "tool_result", name: "t", tool_call_id: "c2", is_error: true }))[0] as { call: { status: string } }).call.status).toBe("error");
});
test("the session line, the init and result summaries and broken lines produce nothing", () => {
  for (const l of ["Session: local-abc", "", "{not json", JSON.stringify({ type: "system", subtype: "init" }), JSON.stringify({ type: "result", text: "final" })]) expect(streamLine(l)).toEqual([]);
});
test("the memory housekeeping line at the end of an answer is cut off", () => {
  expect(stripMemoryTail("Done.\n\nMemory: nothing needed changing.")).toBe(5);
  expect(stripMemoryTail("A normal answer.")).toBe(-1);
});
