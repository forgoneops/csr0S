import { expect, test } from "bun:test";
import { fishSpeak, fishVoices, isFish, withFish } from "./fish";
const piper = { available: () => false, voices: () => [], speak: async (_text: string, _voice?: string) => Buffer.from("piper"), shutdown() {} };
test("a Fish voice goes to Fish, any other voice to Piper, and no key hides Fish", async () => {
  const id = fishVoices()[0].id; expect(isFish(id)).toBe(true);
  let url = ""; const post = (async (u: string) => { url = u; return new Response(new Uint8Array([1, 2])); }) as unknown as typeof fetch;
  expect(withFish(piper, () => null).voices()).toEqual([]);
  const t = withFish(piper, () => "k", post);
  expect(t.available()).toBe(true);
  expect([...(await t.speak("hi", id))]).toEqual([1, 2]); expect(url).toContain("api.fish.audio");
  expect((await t.speak("hi", "pl_PL-gosia-medium")).toString()).toBe("piper");
  await expect(fishSpeak("k", "x", "nope")).rejects.toThrow();
});
