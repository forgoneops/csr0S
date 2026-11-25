// Hand a task from one paired device to another (the trailer's "a task starts on the phone and lands on the PC").
// The sender is an operator on the sending device; the receiver accepts only a key it issued at pairing time, and
// the only thing that key can do is leave a note here. Nothing runs by itself: the person opens it on this device.
import type { Context, Hono } from "hono";
import { kv } from "./db";
import { deviceByTokenName, tokenOf, touch } from "./pairing";
import { MAX_NOTE_BYTES, notes as notesStore, validName } from "./notes";

export type Handoff = { id: string; from: string; text: string; at: number; kind?: "note"; name?: string };
const store = kv("handoff");
const read = () => store.get<Handoff[]>("inbox", []);
export const MAX_ITEMS = 50, MAX_TEXT = 4000;

export function receive(from: string, text: unknown, note?: { name: unknown }): Handoff | { error: "empty" | "full" } {
  const name = note && typeof note.name === "string" && validName(note.name) ? note.name : undefined;
  if (note && !name) return { error: "empty" };                       // a note without a usable name is not a note, and must not slip past the task size cap
  const t = typeof text === "string" ? text.trim().slice(0, note ? MAX_NOTE_BYTES : MAX_TEXT) : "";
  if (!t) return { error: "empty" };
  const list = read(); if (list.length >= MAX_ITEMS) return { error: "full" };
  const h: Handoff = { id: crypto.randomUUID(), from: from.slice(0, 60), text: t, at: Date.now(), ...(note && name ? { kind: "note" as const, name } : {}) };
  store.set("inbox", [h, ...list]); return h;
}

export function handoffApi(app: Hono, isOperator: (c: Context) => boolean, agentName: (c: Context) => string | null, fetchImpl: typeof fetch = fetch) {
  // Receiving: a paired device's own key, nothing else.
  app.post("/api/handoff", async (c) => {
    const dev = deviceByTokenName(agentName(c));
    if (!dev) return c.json({ error: "not_paired" }, 401);
    const b = await c.req.json().catch(() => ({})) as { text?: unknown; kind?: unknown; name?: unknown };
    const r = receive(dev.name, b.text, b.kind === "note" ? { name: b.name } : undefined); if ("error" in r) return c.json(r, r.error === "full" ? 429 : 400);
    touch(dev.id); return c.json({ ok: true }, 201);
  });
  app.get("/api/handoff", (c) => (isOperator(c) ? c.json(read()) : c.json({ error: "operator_only" }, 403)));
  app.delete("/api/handoff/:id", (c) => { if (!isOperator(c)) return c.json({ error: "operator_only" }, 403); store.set("inbox", read().filter((h) => h.id !== c.req.param("id"))); return c.json({ ok: true }); });
  // A note that arrived is only a note in the inbox until the person saves it: then it becomes a real note, never overwriting one.
  app.post("/api/handoff/:id/accept", (c) => {
    if (!isOperator(c)) return c.json({ error: "operator_only" }, 403);
    const h = read().find((x) => x.id === c.req.param("id"));
    if (!h || h.kind !== "note" || !h.name) return c.json({ error: "not_a_note" }, 400);
    let name = h.name, r = notesStore.create(name, h.text);
    if ("error" in r && r.error === "exists") { name = `${h.name} (from ${h.from})`.slice(0, 80); r = notesStore.create(name, h.text); }
    if ("error" in r) return c.json({ error: r.error }, 400);
    store.set("inbox", read().filter((x) => x.id !== h.id)); return c.json({ ok: true, name });
  });
  // Sending: this core talks to the paired core with the key it was given.
  app.post("/api/handoff/send", async (c) => {
    if (!isOperator(c)) return c.json({ error: "operator_only" }, 403);
    const b = await c.req.json().catch(() => ({})) as { deviceId?: unknown; text?: unknown; noteId?: unknown };
    const peer = typeof b.deviceId === "string" ? tokenOf(b.deviceId) : null;
    if (!peer) return c.json({ error: "cannot_send" }, 400);
    let payload: Record<string, unknown> = { text: b.text };
    if (typeof b.noteId === "string") { const n = notesStore.get(b.noteId); if (!n) return c.json({ error: "no_such_note" }, 404); payload = { text: n.content, kind: "note", name: b.noteId }; }
    try {
      const r = await fetchImpl(`${peer.url}/api/handoff`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${peer.token}` }, body: JSON.stringify(payload), signal: AbortSignal.timeout(6000) });
      return r.ok ? c.json({ ok: true }) : c.json({ error: "refused" }, 400);
    } catch { return c.json({ error: "unreachable" }, 502); }
  });
}
