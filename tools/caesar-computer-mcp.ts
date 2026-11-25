#!/usr/bin/env bun
// MCP server (stdio) that lets an agent such as a Hermes crew member use CaesarOS's computer layer. It holds no power of
// its own: every call goes to the local core with a token scoped to "computer", and the core refuses everything unless the
// person has armed the feature (and it expires on its own). The token is read from the instance's data folder at each call,
// so it can be renewed without re-registering this server.
//   register:  hermes -p caesar mcp add caesar-computer --command bun --args "<repo>/tools/caesar-computer-mcp.ts"
// Env: CAESAROS_URL (default http://127.0.0.1:4479), CAESAROS_DATA (default ~/.local/share/caesaros-mine)
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const BASE = process.env.CAESAROS_URL ?? "http://127.0.0.1:4479";
const DATA = process.env.CAESAROS_DATA ?? join(homedir(), ".local/share/caesaros-mine");
const token = () => { try { return readFileSync(join(DATA, "computer-token"), "utf8").trim(); } catch { return ""; } };

const TOOLS = [
  { name: "computer_windows", description: "List the windows on this computer (address, class, title, size). Needs the person to have switched Computer on.", inputSchema: { type: "object", properties: {} } },
  { name: "computer_focus", description: "Bring one window to the front by its address.", inputSchema: { type: "object", properties: { address: { type: "string" } }, required: ["address"] } },
  { name: "computer_type", description: "Type text into ONE window by its address (it is focused and verified first). Refuses password and secret prompts. Max 2000 characters.", inputSchema: { type: "object", properties: { address: { type: "string" }, text: { type: "string" } }, required: ["address", "text"] } },
  { name: "computer_keys", description: "Press a key combination (for example Return, ctrl+l) in ONE window by its address.", inputSchema: { type: "object", properties: { address: { type: "string" }, combo: { type: "string" } }, required: ["address", "combo"] } },
  { name: "computer_cursor", description: "Where the pointer is.", inputSchema: { type: "object", properties: {} } },
  { name: "computer_screenshot", description: "A picture of one window (by address) or the whole screen.", inputSchema: { type: "object", properties: { window: { type: "string" } } } },
];

async function call(path: string, method: string, body?: unknown): Promise<Response> {
  return fetch(BASE + path, { method, headers: { "content-type": "application/json", authorization: `Bearer ${token()}` }, body: body === undefined ? undefined : JSON.stringify(body) });
}

async function run(name: string, a: Record<string, unknown>) {
  const map: Record<string, [string, string, unknown?]> = {
    computer_windows: ["/api/computer/windows", "GET"], computer_cursor: ["/api/computer/cursor", "GET"],
    computer_focus: ["/api/computer/focus", "POST", { address: a.address }], computer_type: ["/api/computer/type", "POST", { address: a.address, text: a.text }],
    computer_keys: ["/api/computer/keys", "POST", { address: a.address, combo: a.combo }], computer_screenshot: ["/api/computer/screenshot", "POST", { window: a.window }],
  };
  const m = map[name]; if (!m) return { isError: true, content: [{ type: "text", text: `unknown tool ${name}` }] };
  if (!token()) return { isError: true, content: [{ type: "text", text: "No computer token yet. The person creates it in CaesarOS (Computer page) and switches Computer on." }] };
  const r = await call(m[0], m[1], m[2]);
  if (name === "computer_screenshot" && r.ok) return { content: [{ type: "image", data: Buffer.from(await r.arrayBuffer()).toString("base64"), mimeType: "image/png" }] };
  const text = await r.text();
  if (!r.ok) return { isError: true, content: [{ type: "text", text: r.status === 409 && /not_armed/.test(text) ? "Computer control is switched off. Ask the person to switch it on in CaesarOS (Computer page), then try again." : `refused (${r.status}): ${text.slice(0, 200)}` }] };
  return { content: [{ type: "text", text }] };
}

const send = (o: unknown) => process.stdout.write(JSON.stringify(o) + "\n");
let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", async (chunk) => {
  buf += chunk; let nl: number;
  while ((nl = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1); if (!line) continue;
    let msg: { id?: number | string; method?: string; params?: { name?: string; arguments?: Record<string, unknown> } };
    try { msg = JSON.parse(line); } catch { continue; }
    if (msg.id === undefined) continue;                                          // notifications need no answer
    if (msg.method === "initialize") send({ jsonrpc: "2.0", id: msg.id, result: { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "caesar-computer", version: "1.0.0" } } });
    else if (msg.method === "tools/list") send({ jsonrpc: "2.0", id: msg.id, result: { tools: TOOLS } });
    else if (msg.method === "tools/call") { try { send({ jsonrpc: "2.0", id: msg.id, result: await run(msg.params?.name ?? "", msg.params?.arguments ?? {}) }); } catch (e) { send({ jsonrpc: "2.0", id: msg.id, result: { isError: true, content: [{ type: "text", text: String(e).slice(0, 200) }] } }); } }
    else if (msg.method === "ping") send({ jsonrpc: "2.0", id: msg.id, result: {} });
    else send({ jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: "method not found" } });
  }
});
