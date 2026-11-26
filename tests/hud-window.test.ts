// HUD: what the system can say about the window you are in, as metadata only (app, title, place), and whether something fullscreen is on top.
import { expect, test } from "bun:test";
import { Hono } from "hono";
import { hudApi, seeWindows } from "../core/windowinfo";

const client = (o: Record<string, unknown>) => ({ address: "0x" + Math.random().toString(16).slice(2, 8), class: "app", title: "t", at: [10, 20], size: [800, 600], mapped: true, hidden: false, fullscreen: 0, focusHistoryID: 5, workspace: { id: 1 }, ...o });
const run = (clients: unknown[], ws = { id: 1 }) => async (args: string[]) => (args.includes("clients") ? JSON.stringify(clients) : args.includes("activeworkspace") ? JSON.stringify(ws) : null);

test("the window you were in is the most recently focused one that is not the HUD itself", async () => {
  const seen = await seeWindows(run([client({ class: "HUD", title: "CaesarOS HUD", focusHistoryID: 0 }), client({ class: "lookalike", title: "CaesarOS HUD evil", focusHistoryID: -1 }), client({ class: "firefox", title: "Inbox", focusHistoryID: 1 }), client({ class: "kitty", title: "~", focusHistoryID: 2 })]));
  expect(seen).toMatchObject({ available: true, window: { app: "lookalike", title: "CaesarOS HUD evil", x: 10, y: 20, w: 800, h: 600 }, fullscreenOver: "" });
  expect((await seeWindows(run([client({ class: "HUD", title: "CaesarOS HUD", focusHistoryID: 0 }), client({ class: "firefox", title: "Inbox", focusHistoryID: 1 })]))).window?.app).toBe("firefox");
});
test("hidden and unmapped windows are never reported, and only metadata comes out", async () => {
  const seen = await seeWindows(run([client({ class: "ghost", focusHistoryID: 0, hidden: true }), client({ class: "unmapped", focusHistoryID: 1, mapped: false }), client({ class: "kitty", title: "~", focusHistoryID: 2, pid: 4242, address: "0xabc" })]));
  expect(seen.window!.app).toBe("kitty"); expect(Object.keys(seen.window!).sort()).toEqual(["app", "h", "title", "w", "x", "y"]);
});
test("a fullscreen window on the current workspace is reported by app name; one on another workspace is not", async () => {
  expect((await seeWindows(run([client({ class: "game", fullscreen: 2, focusHistoryID: 1 })]))).fullscreenOver).toBe("game");
  expect((await seeWindows(run([client({ class: "game", fullscreen: 2, workspace: { id: 3 } })]))).fullscreenOver).toBe("");
  expect((await seeWindows(run([client({ class: "CaesarOS HUD", title: "CaesarOS HUD", fullscreen: 2 })]))).fullscreenOver).toBe("");
});
test("height titles the shell accepts are filtered, and a lookalike is not", async () => {
  const titles = ["CaesarOS HUD ·h1e2", "CaesarOS HUD ·h+120", "CaesarOS HUD ·h.5", "CaesarOS HUD ·h1."];
  for (const title of titles) {
    const seen = await seeWindows(run([client({ class: "HUD", title, focusHistoryID: 0 }), client({ class: "kitty", title: "~", focusHistoryID: 1 })]));
    expect(seen.window?.app).toBe("kitty");
  }
  const lookalike = await seeWindows(run([client({ class: "HUD", title: "CaesarOS HUD ·h1e2x", focusHistoryID: 0 })]));
  expect(lookalike.window?.app).toBe("HUD");
});
test("no Hyprland, an unreadable answer or nothing open say so instead of guessing", async () => {
  expect(await seeWindows(async () => null)).toMatchObject({ available: false, window: null });
  expect(await seeWindows(async () => "not json")).toMatchObject({ available: false, window: null });
  expect(await seeWindows(run([]))).toMatchObject({ available: true, window: null });
});
test("the route is for the operator only", async () => {
  const mk = (op: boolean) => { const a = new Hono(); hudApi(a, () => op, run([client({ class: "kitty", title: "x" })])); return a; };
  expect((await mk(false).request("/api/hud/window")).status).toBe(403);
  const ok = await mk(true).request("/api/hud/window"); expect(ok.status).toBe(200); expect((await ok.json() as { window: { app: string } }).window.app).toBe("kitty");
});
