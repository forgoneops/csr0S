// Reading aloud (voice): a warm local Piper process per voice behind one function, ported from the old cockpit's brain plugin (behaviour only).
// Optional: where the engine or its voices are not installed (tools/speech/install-tts.sh) `available()` is false and the page falls back to the
// browser's own voice. Text goes to a local process only; nothing is sent anywhere. The route is the operator's own.
import type { Context, Hono } from "hono";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { ROOT } from "./root";

export type TtsPaths = { python: string; worker: string; voices: string };
/** Next to the speech-to-text home (`CAESAROS_SPEECH_DIR`, default ~/.local/share/caesaros-speech): tts/venv holds Piper, tts/voices the voice files. */
const speechDir = () => process.env.CAESAROS_SPEECH_DIR ?? join(homedir(), ".local", "share", "caesaros-speech");
// The worker ships in resources/tools/speech next to an installed app; ROOT is the source tree or that resource folder.
export const ttsPaths = (repo: string = ROOT): TtsPaths => ({
  python: process.env.CAESAROS_TTS_PYTHON ?? join(speechDir(), "tts", "venv", "bin", "python"),
  worker: process.env.CAESAROS_TTS_WORKER ?? join(repo, "tools", "speech", "tts_worker.py"),
  voices: process.env.CAESAROS_TTS_VOICES ?? join(speechDir(), "tts", "voices"),
});
export type Voice = { id: string; lang: string; label: string };
const LOADED = 2;                                      // voices kept in memory at once (about 150 MB each); the least recently used one is stopped
type Pending = { resolve: (wav: Buffer) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> };
type Worker = { proc: ReturnType<typeof Bun.spawn>; ready: Promise<void>; pending: Map<string, Pending>; used: number };

export function createTts(p: TtsPaths, timeoutMs = 60_000) {
  const workers = new Map<string, Worker>();
  let seq = 0;
  const files = (): string[] => { try { return readdirSync(p.voices).filter((f) => f.endsWith(".onnx") && existsSync(join(p.voices, f + ".json"))).sort(); } catch { return []; } };
  /** "pl_PL-gosia-medium.onnx" is offered as { id: "pl_PL-gosia-medium", lang: "pl", label: "gosia · PL (medium)" }. Polish first, then English. */
  const voices = (): Voice[] => files().map((f) => {
    const id = f.replace(/\.onnx$/, ""), m = /^([a-z]{2})_([A-Z]{2})-(.+)-(x_low|low|medium|high)$/.exec(id);
    if (!m) return { id, lang: "other", label: id };
    const region = m[1] === "en" ? ` ${m[2] === "GB" ? "UK" : m[2]}` : "";
    return { id, lang: m[1], label: `${m[3].replace(/_/g, " ")} · ${m[1].toUpperCase()}${region} (${m[4].replace("_", " ")})` };
  }).sort((x, y) => (x.lang === y.lang ? x.label.localeCompare(y.label) : x.lang === "pl" ? -1 : y.lang === "pl" ? 1 : x.lang === "other" ? 1 : y.lang === "other" ? -1 : x.lang.localeCompare(y.lang)));
  const available = () => existsSync(p.python) && existsSync(p.worker) && voices().length > 0;
  const fail = (w: Worker, e: Error) => { for (const [, q] of w.pending) { clearTimeout(q.timer); q.reject(e); } w.pending.clear(); };

  function start(id: string): Worker {
    const old = workers.get(id); if (old && !old.proc.killed) return old;
    if (workers.size >= LOADED) { const lru = [...workers.entries()].sort((a, b) => a[1].used - b[1].used)[0]; try { lru[1].proc.kill(); } catch { /* gone */ } workers.delete(lru[0]); }
    const child = Bun.spawn([p.python, p.worker, join(p.voices, `${id}.onnx`)], { stdin: "pipe", stdout: "pipe", stderr: "ignore" });
    const w: Worker = { proc: child, pending: new Map(), used: Date.now(), ready: null as unknown as Promise<void> };
    w.ready = new Promise<void>((resolve, reject) => {
      void (async () => {
        const dec = new TextDecoder(); let buf = "", up = false;
        try {
          for await (const chunk of child.stdout as unknown as AsyncIterable<Uint8Array>) {
            buf += dec.decode(chunk, { stream: true });
            for (let nl = buf.indexOf("\n"); nl >= 0; nl = buf.indexOf("\n")) {
              const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
              let m: { ready?: boolean; id?: unknown; ok?: boolean; wav?: string; error?: string }; try { m = JSON.parse(line); } catch { continue; }
              if (m.ready) { up = true; resolve(); continue; }
              const q = w.pending.get(String(m.id)); if (!q) continue;
              w.pending.delete(String(m.id)); clearTimeout(q.timer);
              m.ok ? q.resolve(Buffer.from(m.wav ?? "", "base64")) : q.reject(new Error(m.error ?? "the voice failed"));
            }
          }
        } finally { if (workers.get(id) === w) workers.delete(id); if (!up) reject(new Error("the voice did not start")); fail(w, new Error("the voice stopped")); }
      })();
    });
    w.ready.catch(() => {});
    workers.set(id, w);
    return w;
  }
  const pick = (voice?: string): string => {
    const all = voices(); if (!all.length) throw new Error("the local voice is not installed");
    if (!voice) return all[0].id;
    if (!all.some((v) => v.id === voice)) throw new Error("no such voice");     // only names from the list reach the file system
    return voice;
  };

  /** One sentence in, one WAV out. Requests to one voice run one at a time inside its worker. */
  async function speak(text: string, voice?: string): Promise<Buffer> {
    const t = text.replace(/\s+/g, " ").trim(); if (!t) throw new Error("nothing to say");
    if (!existsSync(p.python) || !existsSync(p.worker)) throw new Error("the local voice is not installed");
    const w = start(pick(voice)); w.used = Date.now();
    await w.ready;
    const id = String(++seq);
    return new Promise<Buffer>((resolve, reject) => {
      const timer = setTimeout(() => { w.pending.delete(id); reject(new Error("the voice took too long")); }, timeoutMs);
      w.pending.set(id, { resolve, reject, timer });
      try { const s = w.proc.stdin as unknown as { write(d: string): void; flush?: () => void }; s.write(JSON.stringify({ id, text: t.slice(0, 600) }) + "\n"); s.flush?.(); } catch (e) { clearTimeout(timer); w.pending.delete(id); reject(e as Error); }
    });
  }
  const shutdown = () => { for (const w of workers.values()) { try { w.proc.kill(); } catch { /* gone */ } } workers.clear(); };
  return { available, voices, speak, shutdown };
}
export type Tts = ReturnType<typeof createTts>;

export function ttsApi(app: Hono, isOperator: (c: Context) => boolean, tts: () => Tts): void {
  app.get("/api/tts/status", (c) => {
    if (!isOperator(c)) return c.json({ error: "operator_only" }, 403);
    const ready = tts().available();
    return c.json({ ready, voices: ready ? tts().voices() : [] });
  });
  app.post("/api/tts", async (c) => {
    if (!isOperator(c)) return c.json({ error: "operator_only" }, 403);
    const b = (await c.req.json().catch(() => ({}))) as { text?: unknown; voice?: unknown };
    const text = typeof b.text === "string" ? b.text.trim() : "";
    if (!text) return c.json({ error: "text_required" }, 400);
    if (!tts().available()) return c.json({ error: "not_installed" }, 503);
    if (b.voice !== undefined && (typeof b.voice !== "string" || !tts().voices().some((v) => v.id === b.voice))) return c.json({ error: "no_such_voice" }, 400);
    try { return new Response(new Uint8Array(await tts().speak(text, b.voice as string | undefined)), { headers: { "content-type": "audio/wav", "cache-control": "no-store" } }); }
    catch (e) { return c.json({ error: (e as Error).message.slice(0, 160) }, 502); }
  });
}
