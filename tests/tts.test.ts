// Reading aloud (voice): a warm local Piper voice behind one function. The real Piper is not needed here: a stand-in worker speaks the same line protocol.
import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { createTts, ttsApi } from "../core/tts";

function bench() {
  const d = mkdtempSync(join(tmpdir(), "tts-")), voices = join(d, "voices"); require("node:fs").mkdirSync(voices);
  for (const v of ["pl_PL-gosia-medium", "en_US-lessac-medium", "weird name"]) { writeFileSync(join(voices, v + ".onnx"), "x"); writeFileSync(join(voices, v + ".onnx.json"), "{}"); }
  const worker = join(d, "worker.js");   // the same protocol as tools/speech/tts_worker.py: a ready line, then one JSON line in, one out
  writeFileSync(worker, `const v=process.argv[2].split("/").pop();console.log(JSON.stringify({ready:true,voice:v}));const rl=require("node:readline").createInterface({input:process.stdin});rl.on("line",l=>{const r=JSON.parse(l);if(r.text==="boom")console.log(JSON.stringify({id:r.id,ok:false,error:"nope"}));else console.log(JSON.stringify({id:r.id,ok:true,wav:Buffer.from(v+"|"+r.text).toString("base64")}))});`);
  return createTts({ python: process.execPath, worker, voices }, 5000);
}

test("voices are listed with Polish first, and only well-formed files", () => {
  const t = bench();
  expect(t.available()).toBe(true);
  expect(t.voices().map((v) => v.id)).toEqual(["pl_PL-gosia-medium", "en_US-lessac-medium", "weird name"].filter((x) => x !== "weird name").concat(["weird name"]));
  expect(t.voices()[0]).toMatchObject({ lang: "pl", label: "gosia · PL (medium)" });
});
test("one sentence in, audio out, with the chosen voice; an unknown voice never reaches the file system", async () => {
  const t = bench();
  expect((await t.speak("Dzień dobry", "pl_PL-gosia-medium")).toString()).toBe("pl_PL-gosia-medium.onnx|Dzień dobry");
  expect((await t.speak("  hello   there ")).toString()).toContain("|hello there");
  await expect(t.speak("x", "../../etc/passwd")).rejects.toThrow("no such voice");
  await expect(t.speak("   ")).rejects.toThrow("nothing to say");
  await expect(t.speak("boom")).rejects.toThrow("nope");
  t.shutdown();
});
test("without Piper the answer is that it is not installed, and the route says so", async () => {
  const t = createTts({ python: "/nonexistent/python", worker: "/nonexistent/w.py", voices: "/nonexistent" });
  expect(t.available()).toBe(false);
  const a = new Hono(); ttsApi(a, () => true, () => t);
  expect(await (await a.request("/api/tts/status")).json()).toEqual({ ready: false, voices: [] });
  expect((await a.request("/api/tts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "hi" }) })).status).toBe(503);
});
test("the route returns audio for the operator and refuses everyone else", async () => {
  const t = bench(), mk = (op: boolean) => { const a = new Hono(); ttsApi(a, () => op, () => t); return a; };
  const post = (a: Hono, body: unknown) => a.request("/api/tts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const ok = await post(mk(true), { text: "Cześć", voice: "pl_PL-gosia-medium" }); expect(ok.status).toBe(200); expect(ok.headers.get("content-type")).toBe("audio/wav"); expect(await ok.text()).toContain("Cześć");
  expect((await post(mk(false), { text: "hi" })).status).toBe(403); expect((await mk(false).request("/api/tts/status")).status).toBe(403);
  expect((await post(mk(true), { text: "" })).status).toBe(400); expect((await post(mk(true), { text: "x", voice: "nope" })).status).toBe(400);
  t.shutdown();
});
