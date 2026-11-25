// Speech to text, fully on this computer: faster-whisper ("base" model, CPU) in its own folder under the data home.
// The audio goes from the page to the core, to a temporary file, to the local script, and the file is deleted after.
// Nothing leaves the machine. It is installed once with `uv venv` + `uv pip install faster-whisper` (see docs/STATE.md).
import type { Context, Hono } from "hono";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

export const MAX_AUDIO = 40 * 1024 * 1024;
const DIR = () => process.env.CAESAROS_SPEECH_DIR ?? join(homedir(), ".local", "share", "caesaros-speech");
const python = () => join(DIR(), ".venv", "bin", "python");
export const speechReady = () => existsSync(python()) && existsSync(join(DIR(), "transcribe.py"));

export type Transcript = { text: string; language: string; segments: { start: number; end: number; text: string }[] };

/** The script's JSON, or null when it is not what we expect. */
export function parseTranscript(out: string): Transcript | null {
  try { const j = JSON.parse(out.trim().split("\n").pop() ?? ""); return typeof j.text === "string" && Array.isArray(j.segments) ? { text: j.text, language: String(j.language ?? ""), segments: j.segments } : null; } catch { return null; }
}

let busy = false;   // one transcription at a time: the model uses every core
export async function transcribe(audio: Uint8Array, language = "auto"): Promise<Transcript | { error: string }> {
  if (!speechReady()) return { error: "not_installed" };
  if (audio.length > MAX_AUDIO || !audio.length) return { error: "bad_size" };
  if (!/^[a-z]{2,3}$|^auto$/.test(language)) return { error: "bad_language" };
  if (busy) return { error: "busy" };
  busy = true;
  const dir = mkdtempSync(join(tmpdir(), "caesaros-speech-")), f = join(dir, "in.audio");
  try {
    writeFileSync(f, audio, { mode: 0o600 });
    const p = Bun.spawn([python(), join(DIR(), "transcribe.py"), f, language], { stdin: "ignore", stdout: "pipe", stderr: "ignore" });
    const t = setTimeout(() => p.kill(), 10 * 60_000);
    const out = await new Response(p.stdout as ReadableStream).text(); clearTimeout(t);
    return parseTranscript(out) ?? { error: "failed" };
  } catch { return { error: "failed" }; } finally { busy = false; rmSync(dir, { recursive: true, force: true }); }
}

export const speechApi = (app: Hono, isOperator: (c: Context) => boolean) => {
  app.get("/api/transcribe/status", (c) => (isOperator(c) ? c.json({ ready: speechReady() }) : c.json({ error: "operator_only" }, 403)));
  app.post("/api/transcribe", async (c) => {
    if (!isOperator(c)) return c.json({ error: "operator_only" }, 403);
    const len = Number(c.req.header("content-length") ?? 0); if (len > MAX_AUDIO) return c.json({ error: "bad_size" }, 413);
    const r = await transcribe(new Uint8Array(await c.req.arrayBuffer()), c.req.query("lang") ?? "auto");
    return "error" in r ? c.json(r, r.error === "busy" ? 429 : r.error === "not_installed" ? 503 : 400) : c.json(r);
  });
};
