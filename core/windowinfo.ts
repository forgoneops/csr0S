// HUD context (plan 8.14): which window is under the HUD, as METADATA only: the app, the title and where it sits, never pixels. Read from Hyprland's
// own `hyprctl -j clients`; where Hyprland is not running it says so. Also whether something is fullscreen on the current workspace, so the HUD can step back
// like Hermes Desktop's game overlay. Behaviour only; the code is ours. The page decides whether the title is ever used: it is off until the person turns it on.
import type { Context, Hono } from "hono";

export type Run = (args: string[]) => Promise<string | null>;
export type Seen = { available: boolean; reason?: string; window: { app: string; title: string; x: number; y: number; w: number; h: number } | null; fullscreenOver: string };
export const HUD_TITLE_PREFIX = "CaesarOS HUD";
/** The shell accepts only the bare title or a valid `·h<px>`, `·close`, `·open` command. A lookalike prefix is another window. */
const isHudTitle = (title: string) => title === HUD_TITLE_PREFIX
  || /^·(h\d+(?:\.\d+)?|close|open)$/.test(title.slice(HUD_TITLE_PREFIX.length).trim());

/** The real runner: `hyprctl -j <args>` with a short timeout; null when it is absent or fails. */
export const hyprctl: Run = async (args) => {
  try {
    const p = Bun.spawn(["hyprctl", "-j", ...args], { stdout: "pipe", stderr: "ignore", stdin: "ignore" });
    const t = setTimeout(() => p.kill(), 1500);
    const out = await new Response(p.stdout).text(); clearTimeout(t);
    return (await p.exited) === 0 ? out : null;
  } catch { return null; }
};

type Client = { class?: string; title?: string; at?: number[]; size?: number[]; mapped?: boolean; hidden?: boolean; fullscreen?: number | boolean; focusHistoryID?: number; workspace?: { id?: number } };

export async function seeWindows(run: Run = hyprctl): Promise<Seen> {
  const raw = await run(["clients"]);
  if (raw == null) return { available: false, reason: "no_hyprland", window: null, fullscreenOver: "" };
  let list: unknown; try { list = JSON.parse(raw); } catch { return { available: false, reason: "unreadable", window: null, fullscreenOver: "" }; }
  if (!Array.isArray(list)) return { available: false, reason: "unreadable", window: null, fullscreenOver: "" };
  const shown = (list as Client[]).filter((c) => c && c.mapped !== false && !c.hidden && !isHudTitle(String(c.title ?? "")));
  const last = [...shown].sort((a, b) => (a.focusHistoryID ?? 99) - (b.focusHistoryID ?? 99))[0];
  let wsId: number | null = null; try { wsId = (JSON.parse((await run(["activeworkspace"])) ?? "null") as { id?: number } | null)?.id ?? null; } catch { wsId = null; }
  const full = shown.find((c) => (c.fullscreen === true || Number(c.fullscreen) > 0) && (wsId === null || c.workspace?.id === wsId));
  return {
    available: true,
    window: last ? { app: String(last.class ?? ""), title: String(last.title ?? ""), x: last.at?.[0] ?? 0, y: last.at?.[1] ?? 0, w: last.size?.[0] ?? 0, h: last.size?.[1] ?? 0 } : null,
    fullscreenOver: full ? String(full.class ?? "") : "",
  };
}

export function hudApi(app: Hono, isOperator: (c: Context) => boolean, run: Run = hyprctl): void {
  app.get("/api/hud/window", async (c) => (isOperator(c) ? c.json(await seeWindows(run)) : c.json({ error: "operator_only" }, 403)));
}
