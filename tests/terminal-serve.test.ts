// S4 end to end over the wire: a real Hono app served by Bun, the real permission gate, a real PTY
// and a real WebSocket. This is the test that would catch a broken upgrade, a JSON protocol drift or
// a session that outlives its end. Operator requests carry the Sec-Fetch headers a browser sends.
import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";

process.env.CAESAROS_DATA = mkdtempSync(join(tmpdir(), "caesaros-terminal-serve-"));
process.env.CAESAROS_EDITION = "owner"; // the suite shares one process: another file sets "standard"

const { TerminalSessions, terminalRoutes, terminalSocket } = await import("../core/terminal");
const { recent } = await import("../core/audit");

const sessions = new TerminalSessions();
const app = new Hono();
terminalRoutes(app, sessions);

const server: Bun.Server<{ id: string }> = Bun.serve<{ id: string }>({
  hostname: "127.0.0.1",
  port: 0,
  fetch: (req): Response | Promise<Response> => app.fetch(req, { server }),
  websocket: terminalSocket(sessions) as unknown as Bun.WebSocketHandler<{ id: string }>,
});

const base = `http://127.0.0.1:${server.port}`;
const operatorHeaders = { "sec-fetch-site": "same-origin", host: `127.0.0.1:${server.port}` };

afterAll(() => { sessions.shutdown(); server.stop(true); });

async function open(): Promise<{ id: string; response: Response }> {
  const response = await app.request(`${base}/api/terminal/sessions`, {
    method: "POST",
    headers: { ...operatorHeaders, "content-type": "application/json" },
    body: JSON.stringify({ cols: 90, rows: 28 }),
  });
  const body = await response.json() as { id?: string };
  return { id: body.id ?? "", response };
}

/** Connect, collect frames for a while, and return the text the server sent. A browser sends Origin
 *  on a WebSocket handshake; this client sends the same headers a browser would. */
function speak(id: string, send: (ws: WebSocket) => void, waitMs = 900, headers: Record<string, string> = { origin: base, host: `127.0.0.1:${server.port}` }): Promise<{ text: string; closeCode: number | null }> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/api/terminal/ws?id=${encodeURIComponent(id)}`, { headers } as unknown as string[]);
    let text = "";
    let closeCode: number | null = null;
    ws.binaryType = "arraybuffer";
    ws.onmessage = (event) => {
      if (typeof event.data === "string") text += event.data + "\n";
      else text += new TextDecoder().decode(new Uint8Array(event.data as ArrayBuffer));
    };
    ws.onclose = (event) => { closeCode = event.code; };
    ws.onopen = () => send(ws);
    setTimeout(() => { try { ws.close(); } catch { /* already closed */ } resolve({ text, closeCode }); }, waitMs);
  });
}

describe("terminal over HTTP and WebSocket", () => {
  test("the terminal reports itself enabled in the owner edition", async () => {
    const r = await app.request(`${base}/api/terminal`);
    expect(r.status).toBe(200);
    const body = await r.json() as { enabled: boolean; edition: string; idleMs: number };
    expect(body.enabled).toBe(true);
    expect(body.edition).toBe("owner");
    expect(body.idleMs).toBeGreaterThan(0);
  });

  test("a request without the browser's own headers is refused, and nothing is spawned", async () => {
    const r = await app.request(`${base}/api/terminal/sessions`, { method: "POST", headers: { host: `127.0.0.1:${server.port}`, "content-type": "application/json" }, body: "{}" });
    expect(r.status).toBe(403);
    expect(sessions.size()).toBe(0);
  });

  test("the client edition answers 404 and never opens a session", async () => {
    process.env.CAESAROS_EDITION = "standard";
    try {
      const r = await app.request(`${base}/api/terminal/sessions`, { method: "POST", headers: { ...operatorHeaders, "content-type": "application/json" }, body: "{}" });
      expect(r.status).toBe(404);
      const info = await app.request(`${base}/api/terminal`);
      expect((await info.json() as { enabled: boolean }).enabled).toBe(false);
      expect(sessions.size()).toBe(0);
    } finally { process.env.CAESAROS_EDITION = "owner"; }
  });

  test("a session writes its audit row and the WebSocket streams the shell's real output", async () => {
    const { id, response } = await open();
    expect(response.status).toBe(200);
    expect(id.length).toBeGreaterThan(20);
    const rows = recent(20);
    expect(rows.some((row) => row.subject_kind === "terminal" && row.confidence === "seen")).toBe(true);

    const { text } = await speak(id, (ws) => {
      ws.send(JSON.stringify({ t: "in", d: "echo S4_MARKER_$((6*7))\n" }));
    }, 1200);
    expect(text).toContain("S4_MARKER_42");

    const ended = await app.request(`${base}/api/terminal/sessions/${id}`, { method: "DELETE", headers: operatorHeaders });
    expect(ended.status).toBe(200);
    expect(sessions.has(id)).toBe(false);
  });

  test("a resize is accepted over the socket and a wrong id never upgrades", async () => {
    const { id } = await open();
    const { text } = await speak(id, (ws) => {
      ws.send(JSON.stringify({ t: "resize", cols: 120, rows: 40 }));
      ws.send(JSON.stringify({ t: "in", d: "stty size\n" }));
    }, 1200);
    expect(text).toContain("40 120");
    await app.request(`${base}/api/terminal/sessions/${id}`, { method: "DELETE", headers: operatorHeaders });

    const missing = await speak("not-a-session", () => {}, 500);
    expect(missing.text).toBe("");
  });

  test("a cross-origin page cannot borrow the operator's socket", async () => {
    const { id } = await open();
    const refused = await speak(id, () => {}, 500, { origin: "http://evil.example", host: `127.0.0.1:${server.port}` });
    expect(refused.text).toBe("");
    await app.request(`${base}/api/terminal/sessions/${id}`, { method: "DELETE", headers: operatorHeaders });
  });

  test("a refused edition tears nothing down that was already running", async () => {
    expect(sessions.size()).toBe(0);
  });
});
