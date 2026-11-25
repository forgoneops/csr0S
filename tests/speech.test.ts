import { expect, test } from "bun:test";
import { parseTranscript, transcribe } from "../core/speech";

test("the script's last line becomes a transcript, anything else is null", () => {
  expect(parseTranscript('warning\n{"text":"hi","language":"en","segments":[{"start":0,"end":1,"text":"hi"}]}')).toEqual({ text: "hi", language: "en", segments: [{ start: 0, end: 1, text: "hi" }] });
  expect(parseTranscript("")).toBeNull(); expect(parseTranscript("{bad")).toBeNull(); expect(parseTranscript('{"text":1}')).toBeNull();
});
test("without the install, or with nothing to read, it refuses plainly", async () => {
  const old = process.env.CAESAROS_SPEECH_DIR; process.env.CAESAROS_SPEECH_DIR = "/nonexistent-speech-dir";
  try { expect(await transcribe(new Uint8Array([1]))).toEqual({ error: "not_installed" }); } finally { if (old === undefined) delete process.env.CAESAROS_SPEECH_DIR; else process.env.CAESAROS_SPEECH_DIR = old; }
});
