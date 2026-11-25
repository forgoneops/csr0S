// Chat sync between paired devices, end to end: a conversation is sealed with AES-256-GCM using a key only the two devices
// hold (made at pairing, never sent anywhere else), so whatever carries it (a proxy, a relay, a log) sees ciphertext only.
// Same rules as notes: off by default per device, one way, nothing overwritten or deleted. A conversation from another
// device arrives as its own session titled "<title> (via <device>)"; later messages from it are appended to that same copy.
// Only role, text, status and time travel: thinking, tool output, sources and attachments stay on the device.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { Hono } from "hono";
import { kv } from "./db";
import { appendMessage, createSession, getSession, listSessions } from "./chat";
import { deviceByTokenName, syncKeyOf, tokenOf, touch } from "./pairing";

export const COPY = " (via ";
/** Devices the person switched conversation sync on for. */
export const chatsOn = (): Record<string, boolean> => read().on;
export const MAX_SESSIONS = 20, MAX_MESSAGES = 300, MAX_TEXT = 200_000;
type Wire = { id: string; title: string; engine: string; messages: { id: string; role: "user" | "assistant" | "system"; content: string; status: string; at: number }[] };
const state = kv("chatsync");
type St = { on: Record<string, boolean>; last: Record<string, number> };
const read = (): St => state.get<St>("state", { on: {}, last: {} });
const map = kv("chatmap");   // "<device>:<remote session id>" -> { local, seen: remote message ids }

export function seal(keyB64: string, value: unknown): string {
  const iv = randomBytes(12), c = createCipheriv("aes-256-gcm", Buffer.from(keyB64, "base64"), iv);
  const ct = Buffer.concat([c.update(JSON.stringify(value), "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64");
}
/** The value, or null when the key is wrong or the bytes were changed in transit. */
export function open(keyB64: string, sealed: unknown): unknown | null {
  try {
    const b = Buffer.from(String(sealed), "base64"), d = createDecipheriv("aes-256-gcm", Buffer.from(keyB64, "base64"), b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString("utf8"));
  } catch { return null; }
}

/** Conversations changed since the last push, copies from other devices excluded. */
export function changedChats(since: number): Wire[] {
  const out: Wire[] = [];
  for (const s of listSessions()) {
    if (s.updatedAt <= since || s.title.includes(COPY)) continue;
    const g = getSession(s.id); if (!g || !g.messages.length) continue;
    out.push({ id: s.id, title: s.title.slice(0, 200), engine: s.engine, messages: g.messages.slice(-MAX_MESSAGES).map((m) => ({ id: m.id, role: m.role as Wire["messages"][number]["role"], content: m.content.slice(0, MAX_TEXT), status: m.status, at: m.createdAt })) });
    if (out.length >= MAX_SESSIONS) break;
  }
  return out;
}

export function applyChats(deviceId: string, from: string, items: unknown): { sessions: number; messages: number } {
  const out = { sessions: 0, messages: 0 };
  if (!Array.isArray(items)) return out;
  for (const it of items.slice(0, MAX_SESSIONS) as (Wire | null)[]) {
    if (!it || typeof it.id !== "string" || !Array.isArray(it.messages) || String(it.title ?? "").includes(COPY)) continue;
    const key = `${deviceId}:${it.id}`, cur = map.get<{ local: string; seen: string[] } | null>(key, null);
    let local = cur?.local ?? "", seen = new Set(cur?.seen ?? []);
    if (!local) {
      const suffix = `${COPY}${from.slice(0, 30)})`;
      local = createSession({ title: (String(it.title || "Chat").slice(0, 150) + suffix), engine: String(it.engine ?? "").slice(0, 80) }).id; out.sessions++;
    }
    for (const m of it.messages.slice(0, MAX_MESSAGES)) {
      if (!m || typeof m.id !== "string" || typeof m.content !== "string" || seen.has(m.id)) continue;
      if (m.role !== "user" && m.role !== "assistant" && m.role !== "system") continue;
      appendMessage(local, { role: m.role, content: m.content.slice(0, MAX_TEXT), status: m.status === "error" || m.status === "stopped" ? m.status : "complete" }); seen.add(m.id); out.messages++;
    }
    map.set(key, { local, seen: [...seen].slice(-2000) });
  }
  return out;
}

export async function pushChats(deviceId: string, fetchImpl: typeof fetch = fetch): Promise<{ sent: number } | { error: string }> {
  const peer = tokenOf(deviceId), key = syncKeyOf(deviceId);
  if (!peer) return { error: "cannot_send" };
  if (!key) return { error: "pair_again" };   // paired before conversation keys existed
  const s = read(), since = s.last[deviceId] ?? 0, startedAt = Date.now(), items = changedChats(since);
  if (!items.length) { state.set("state", { ...s, last: { ...s.last, [deviceId]: startedAt } }); return { sent: 0 }; }
  try {
    const r = await fetchImpl(`${peer.url}/api/sync/chats`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${peer.token}` }, body: JSON.stringify({ sealed: seal(key, items) }), signal: AbortSignal.timeout(15000) });
    if (!r.ok) return { error: "refused" };
    const n = read(); state.set("state", { ...n, last: { ...n.last, [deviceId]: startedAt } });
    return { sent: items.length };
  } catch { return { error: "unreachable" }; }
}

export function chatsyncApi(app: Hono, isOperator: (c: import("hono").Context) => boolean, agentName: (c: import("hono").Context) => string | null) {
  app.post("/api/sync/chats", async (c) => {
    const dev = deviceByTokenName(agentName(c));
    if (!dev) return c.json({ error: "not_paired" }, 401);
    const key = syncKeyOf(dev.id); if (!key) return c.json({ error: "no_key" }, 409);
    const b = await c.req.json().catch(() => ({})) as { sealed?: unknown };
    const items = open(key, b.sealed); if (items === null) return c.json({ error: "cannot_decrypt" }, 400);
    touch(dev.id); return c.json({ ok: true, ...applyChats(dev.id, dev.name, items) });
  });
  app.get("/api/sync/chats/state", (c) => (isOperator(c) ? c.json(read().on) : c.json({ error: "operator_only" }, 403)));
  app.put("/api/sync/chats/state/:id", async (c) => {
    if (!isOperator(c)) return c.json({ error: "operator_only" }, 403);
    const b = await c.req.json().catch(() => ({})) as { on?: unknown }, s = read();
    state.set("state", { ...s, on: { ...s.on, [c.req.param("id")]: b.on === true } }); return c.json({ ok: true });
  });
  app.post("/api/sync/chats/now/:id", async (c) => (isOperator(c) ? c.json(await pushChats(c.req.param("id"))) : c.json({ error: "operator_only" }, 403)));
}

export function startChatSync(): () => void {
  const id = setInterval(() => { for (const [dev, on] of Object.entries(read().on)) if (on) void pushChats(dev); }, 60_000);
  return () => clearInterval(id);
}
