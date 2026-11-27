// Over the network only the operator's own browser may change the control plane. Run against a real listening
// server so the request carries what a network caller carries (no in-process shortcut).
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.CAESAROS_DATA ??= mkdtempSync(join(tmpdir(), "caesaros-ow-"));
process.env.CAESAROS_MODULE_DIRS = "plugins";
const { app } = await import("../core/server") as unknown as { app: { fetch: (r: Request, env?: unknown) => Response | Promise<Response> } };

let srv: ReturnType<typeof Bun.serve>;
let url = "";
beforeAll(() => { srv = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: (req, server) => app.fetch(req, { server }) }); url = `http://127.0.0.1:${srv.port}`; });
afterAll(() => srv.stop(true));

const post = (path: string, body: unknown, headers: Record<string, string> = {}, method = "POST") =>
  fetch(url + path, { method, headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
const browser = () => ({ "Sec-Fetch-Site": "same-origin", Origin: url });

describe("control plane writes", () => {
  const writes: [string, string, unknown][] = [
    ["POST", "/api/tokens", { name: "intruder" }],
    ["PUT", "/api/settings", { language: "pl" }],
    ["POST", "/api/gateways", { name: "x", url: "http://a.example" }],
    ["POST", "/api/model-servers", { name: "x", url: "http://a.example" }],
    ["POST", "/api/chat/sessions", { engine: "ollama" }],
    ["PUT", "/api/plugins/hello/enabled", { enabled: false }],
    ["POST", "/api/chat/sessions/x/compact", {}],
    ["DELETE", "/api/chat/sessions/x/summary", {}],
    ["PATCH", "/api/chat/sessions/x", { pinned: true }],
    ["POST", "/api/chat/sessions/x/turns", { content: "read", attachments: [{ name: "a.pdf", mime: "application/pdf", data: "JVBERi0=" }] }],
    ["POST", "/api/models/pull", { model: "llama3.2:1b" }],
    ["DELETE", "/api/models/pull?model=llama3.2:1b", {}],
  ];
  test("a plain network caller (curl, a script, a tailnet peer) is refused on every one", async () => {
    for (const [m, p, b] of writes) {
      const r = await post(p, b, {}, m);
      expect([m, p, r.status]).toEqual([m, p, 403]);
      expect(((await r.json()) as { error: string }).error).toBe("operator_only");
    }
  });
  test("an agent token does not get to change the control plane either", async () => {
    const mint = await post("/api/tokens", { name: "agent-a" }, browser());
    expect(mint.status).toBe(200);
    const { token } = await mint.json() as { token: string };
    for (const [m, p, b] of writes) expect((await post(p, b, { Authorization: `Bearer ${token}` }, m)).status).toBe(403);
  });
  test("the operator's browser can, and reads stay open to any caller on a known host", async () => {
    expect((await post("/api/settings", { textScale: 1 }, browser(), "PUT")).status).toBe(200);
    expect((await fetch(url + "/api/settings")).status).toBe(200);
    expect((await fetch(url + "/api/health")).status).toBe(200);
    expect((await fetch(url + "/api/egress")).status).toBe(403);    // the outbound list is the operator's own
  });
  test("a browser marked cross-site is refused even with the right headers otherwise", async () => {
    expect((await post("/api/settings", { textScale: 1 }, { "Sec-Fetch-Site": "cross-site", Origin: url }, "PUT")).status).toBe(403);
  });
});
