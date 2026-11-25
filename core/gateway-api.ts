// The local gateway: an OpenAI-compatible endpoint so other apps on THIS machine
// can talk to the engines CaesarOS has (Ollama, Claude Code, Codex, ...). Unlike the original, it answers loopback
// callers only and every call needs an agent token the operator issued. Models are named "<engine>/<model>".
import type { Context, Hono } from "hono";
import { knownHost } from "./principal";
import { getEngine, listEngines } from "./engines";
import type { ChatMessage, EngineAdapter } from "./engines";
import { scopeOf } from "./scope";

type Deps = { isAgent: (c: Context) => boolean; localOnly?: () => boolean; engines?: () => EngineAdapter[]; pick?: (id: string) => EngineAdapter | undefined; loopback?: (c: Context) => boolean };

const LOOP = /^(127\.\d+\.\d+\.\d+|::1|::ffff:127\.\d+\.\d+\.\d+)$/;
const fromServer = (c: Context) => {
  const s = (c.env as { server?: { requestIP?: (r: Request) => { address: string } | null } } | undefined)?.server;
  const ip = s?.requestIP?.(c.req.raw)?.address;
  return ip ? LOOP.test(ip) : true; // in-process calls (tests) have no socket; network calls always do
};
const err = (c: Context, status: 400 | 401 | 403 | 404 | 409, message: string) => c.json({ error: { message, type: "invalid_request_error" } }, status);

export function gatewayApi(app: Hono, deps: Deps) {
  const engines = deps.engines ?? listEngines, pick = deps.pick ?? getEngine, loopback = deps.loopback ?? fromServer;

  app.use("/v1/*", async (c, next) => {
    // A reverse proxy (tailscale serve) connects from loopback, so the Host the caller used must be a loopback name too.
    const host = (c.req.header("host") ?? "").toLowerCase();
    if (!loopback(c) || !knownHost(c.req.header("host")) || (host && !/^(localhost|127\.\d+\.\d+\.\d+|\[::1\])(:\d+)?$/.test(host))) return err(c, 403, "this gateway answers only on this machine");
    if (!deps.isAgent(c)) return err(c, 401, "an agent token is required (Authorization: Bearer cae_...)");
    return next();
  });

  app.get("/v1/models", async (c) => {
    const data: { id: string; object: "model"; owned_by: string }[] = [];
    for (const e of engines()) {
      const h = await e.health().catch(() => ({ ok: false, detail: null }));
      if (!h.ok || (deps.localOnly?.() && scopeOf(e) === "cloud")) continue;         // Local only: cloud engines are not even listed
      for (const m of await e.models().catch(() => [])) data.push({ id: `${e.id}/${m.id}`, object: "model", owned_by: e.id });
    }
    return c.json({ object: "list", data });
  });

  app.post("/v1/chat/completions", async (c) => {
    const body = await c.req.json().catch(() => ({})) as { model?: unknown; messages?: unknown; stream?: unknown };
    const [engineId, ...rest] = String(body.model ?? "").split("/");
    const adapter = engineId ? pick(engineId) : undefined;
    if (!adapter) return err(c, 404, "unknown model; use <engine>/<model> as listed by /v1/models");
    if (deps.localOnly?.() && scopeOf(adapter) === "cloud") return err(c, 409, "Local only is on: this engine runs in the cloud. Choose a local engine or switch Local only off.");
    const msgs = Array.isArray(body.messages) ? body.messages as { role?: unknown; content?: unknown }[] : [];
    const messages: ChatMessage[] = msgs.filter((m) => ["system", "user", "assistant"].includes(String(m.role)) && typeof m.content === "string").map((m) => ({ role: m.role as ChatMessage["role"], content: m.content as string }));
    if (!messages.length) return err(c, 400, "messages is required");
    const h = await adapter.health().catch(() => ({ ok: false, detail: "not answering" }));
    if (!h.ok) return err(c, 409, `${adapter.label} is not available${h.detail ? `: ${h.detail}` : ""}`);
    const model = rest.join("/") || "default", id = `chatcmpl-${crypto.randomUUID()}`, created = Math.floor(Date.now() / 1000);
    const chunk = (delta: object, finish: string | null) => ({ id, object: "chat.completion.chunk", created, model: body.model, choices: [{ index: 0, delta, finish_reason: finish }] });

    if (body.stream === true) {
      const enc = new TextEncoder();
      const stream = new ReadableStream({
        async start(ctl) {
          const send = (o: object) => ctl.enqueue(enc.encode(`data: ${JSON.stringify(o)}\n\n`));
          try {
            send(chunk({ role: "assistant" }, null));
            for await (const ev of adapter.stream(messages, { model, signal: c.req.raw.signal })) if (ev.type === "delta") send(chunk({ content: ev.text }, null));
            send(chunk({}, "stop"));
          } catch (e) { send({ error: { message: e instanceof Error ? e.message.slice(0, 200) : "engine failed" } }); }
          ctl.enqueue(enc.encode("data: [DONE]\n\n")); ctl.close();
        },
      });
      return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-store" } });
    }
    let text = "";
    try { for await (const ev of adapter.stream(messages, { model, signal: c.req.raw.signal })) if (ev.type === "delta") text += ev.text; }
    catch (e) { return err(c, 409, e instanceof Error ? e.message.slice(0, 200) : "engine failed"); }
    return c.json({ id, object: "chat.completion", created, model: body.model, choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: "stop" }] });
  });
}
