// Image Studio, fully on this computer: SD-Turbo through diffusers on the CPU, in its own folder under the user's share dir.
// One picture at a time (it uses every core, 10 to 90 seconds). The prompt reaches the script as an argument list entry,
// never through a shell. Pictures are kept as PNG files with a small JSON beside each in the data home.
import type { Context, Hono } from "hono";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DATA } from "./db";

const SIZES = [256, 384, 512] as const;
export const imageDir = () => process.env.CAESAROS_IMAGE_DIR ?? join(homedir(), ".local", "share", "caesaros-image");
const OUT = () => join(DATA, "images");
export const imageReady = () => existsSync(join(imageDir(), ".venv", "bin", "python")) && existsSync(join(imageDir(), "generate.py"));

export type Pic = { id: string; prompt: string; size: number; at: number };
type Job = { id: string; prompt: string; size: number; status: "running" | "error"; at: number };
let job: Job | null = null;

export const cleanPrompt = (p: unknown): string | null => { const s = typeof p === "string" ? p.replace(/\s+/g, " ").trim() : ""; return s.length >= 3 && s.length <= 400 ? s : null; };

export function listPics(): Pic[] {
  try { mkdirSync(OUT(), { recursive: true }); } catch { /* read-only data home: the list is empty */ }
  const out: Pic[] = [];
  try { for (const f of readdirSync(OUT()).filter((n) => /^[0-9a-f-]{36}\.json$/.test(n))) { try { const j = JSON.parse(readFileSync(join(OUT(), f), "utf8")); if (existsSync(join(OUT(), f.replace(".json", ".png")))) out.push({ id: f.slice(0, -5), prompt: String(j.prompt ?? ""), size: Number(j.size) || 0, at: Number(j.at) || 0 }); } catch { /* a broken sidecar is skipped */ } } } catch { /* none */ }
  return out.sort((a, b) => b.at - a.at).slice(0, 60);
}

export function start(prompt: string, size: number): { id: string } | { error: string } {
  if (!imageReady()) return { error: "not_installed" };
  if (job?.status === "running") return { error: "busy" };
  const id = crypto.randomUUID(), png = join(OUT(), `${id}.png`);
  mkdirSync(OUT(), { recursive: true });
  job = { id, prompt, size, status: "running", at: Date.now() };
  const p = Bun.spawn([join(imageDir(), ".venv", "bin", "python"), join(imageDir(), "generate.py"), png, String(size), prompt], { stdin: "ignore", stdout: "ignore", stderr: "ignore" });
  const kill = setTimeout(() => p.kill(), 15 * 60_000);
  void p.exited.then((code) => {
    clearTimeout(kill);
    if (code === 0 && existsSync(png)) { writeFileSync(join(OUT(), `${id}.json`), JSON.stringify({ prompt, size, at: Date.now() })); job = null; }
    else { rmSync(png, { force: true }); if (job?.id === id) job = { ...job, status: "error" }; }
  });
  return { id };
}

export const imageApi = (app: Hono, isOperator: (c: Context) => boolean) => {
  const guard = (c: Context) => (isOperator(c) ? null : c.json({ error: "operator_only" }, 403));
  app.get("/api/image", (c) => guard(c) ?? c.json({ ready: imageReady(), job: job ? { id: job.id, status: job.status, prompt: job.prompt } : null, pics: listPics() }));
  app.post("/api/image", async (c) => {
    const g = guard(c); if (g) return g;
    const b = await c.req.json().catch(() => ({})) as { prompt?: unknown; size?: unknown };
    const prompt = cleanPrompt(b.prompt); if (!prompt) return c.json({ error: "bad_prompt" }, 400);
    const size = SIZES.includes(b.size as 256) ? Number(b.size) : 512;
    const r = start(prompt, size); return "error" in r ? c.json(r, r.error === "busy" ? 429 : 503) : c.json(r);
  });
  app.get("/api/image/:id/file", (c) => {
    const g = guard(c); if (g) return g;
    const id = c.req.param("id"); if (!/^[0-9a-f-]{36}$/.test(id)) return c.json({ error: "bad_id" }, 400);
    try { return new Response(readFileSync(join(OUT(), `${id}.png`)), { headers: { "content-type": "image/png", "cache-control": "private, max-age=3600" } }); } catch { return c.json({ error: "not_found" }, 404); }
  });
  app.delete("/api/image/:id", (c) => {
    const g = guard(c); if (g) return g;
    const id = c.req.param("id"); if (!/^[0-9a-f-]{36}$/.test(id)) return c.json({ error: "bad_id" }, 400);
    rmSync(join(OUT(), `${id}.png`), { force: true }); rmSync(join(OUT(), `${id}.json`), { force: true }); return c.json({ ok: true });
  });
};
