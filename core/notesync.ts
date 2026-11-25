// Keep notes, tasks and events in step between paired devices, with one rule above all: nothing is ever overwritten or deleted.
//   - A note that is new to the receiver is created.
//   - The same text under the same name is skipped.
//   - A different text under an existing name arrives as a copy named after the sender in brackets, once; the person merges by hand.
// The sender pushes notes changed since its last push, only to devices the person switched sync on for, and never
// pushes a copy back, so two devices cannot ping-pong.
import type { Hono } from "hono";
import { kv } from "./db";
import { notes as defaultNotes, validName } from "./notes";
import { deviceByTokenName, tokenOf, touch } from "./pairing";
import { importTask, listTasks } from "./board";
import { importEvent, listEvents } from "./calendar";
import { flagsOf, maskKeys } from "./synccheck";
import { logLine } from "./synclog";

type Store = Pick<typeof defaultNotes, "list" | "get" | "create">;
export type Pushed = { name: string; content: string };
const state = kv("notesync");
type St = { on: Record<string, boolean>; last: Record<string, number> };
const read = (): St => state.get<St>("state", { on: {}, last: {} });
export const COPY = " (via ";
/** Devices the person switched note, task and event sync on for. */
export const notesOn = (): Record<string, boolean> => read().on;
export const MAX_BATCH = 200;

/** Apply what a paired device sent. Returns how many notes were created as new, as copies, and skipped as equal. */
export type Held = { id: string; from: string; name: string; content: string; flags: string[]; at: number };
const heldStore = kv("synchold");
export const MAX_HELD = 200;
export const heldList = (): Held[] => heldStore.get<Held[]>("items", []);

/** `check` false is for an item the person has already looked at and released. */
export function applyPushed(store: Store, from: string, items: unknown, check = true): { created: number; copies: number; same: number; held: number } {
  const out = { created: 0, copies: 0, same: 0, held: 0 };
  if (!Array.isArray(items)) return out;
  for (const it of items.slice(0, MAX_BATCH) as ({ name?: unknown; content?: unknown } | null)[]) {
    if (!it || typeof it !== "object") continue;
    if (!validName(it.name) || typeof it.content !== "string" || (it.name as string).includes(COPY)) continue;
    const flags = check ? flagsOf(it.content) : [];
    if (flags.length) {
      const h = heldList();
      if (!h.some((x) => x.from === from && x.name === it.name && x.content === it.content)) {
        const all = [...h, { id: crypto.randomUUID(), from, name: it.name as string, content: it.content as string, flags, at: Date.now() }];
        if (all.length > MAX_HELD) logLine({ dir: "in", device: from, type: "note", name: all[0].name, outcome: "held list full: oldest dropped" });
        heldStore.set("items", all.slice(-MAX_HELD));
      }
      logLine({ dir: "in", device: from, type: "note", name: it.name as string, outcome: "held: " + flags.join(", ") }); out.held++; continue;
    }
    const cur = store.get(it.name as string);
    if (!cur) { if ("note" in store.create(it.name, it.content)) { out.created++; logLine({ dir: "in", device: from, type: "note", name: it.name as string, outcome: "created" }); } continue; }
    if (cur.content === it.content) { out.same++; continue; }
    const suffix = `${COPY}${from.slice(0, 30)})`, copyName = (it.name as string).slice(0, 80 - suffix.length).trimEnd() + suffix;
    const copy = store.get(copyName);
    if (copy && copy.content === it.content) { out.same++; continue; }
    if (!copy && "note" in store.create(copyName, it.content)) { out.copies++; logLine({ dir: "in", device: from, type: "note", name: copyName, outcome: "copy made" }); }
  }
  return out;
}

/** Notes changed since the last push, copies excluded. */
export function changedSince(store: Store, since: number): Pushed[] {
  const out: Pushed[] = [];
  for (const m of store.list()) {
    if (m.updatedAt <= since || m.id.includes(COPY)) continue;
    const n = store.get(m.id); if (n) out.push({ name: n.id, content: n.content });
    if (out.length >= MAX_BATCH) break;
  }
  return out;
}

export async function pushTo(deviceId: string, store: Store = defaultNotes, fetchImpl: typeof fetch = fetch): Promise<{ sent: number } | { error: string }> {
  const peer = tokenOf(deviceId); if (!peer) return { error: "cannot_send" };
  const s = read(), since = s.last[deviceId] ?? 0, startedAt = Date.now();
  const items = changedSince(store, since), data = changedData(since);
  if (!items.length && !data.tasks.length && !data.events.length) { state.set("state", { ...s, last: { ...s.last, [deviceId]: startedAt } }); return { sent: 0 }; }
  try {
    const r = await fetchImpl(`${peer.url}/api/sync/notes`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${peer.token}` }, body: JSON.stringify({ notes: items, tasks: data.tasks, events: data.events }), signal: AbortSignal.timeout(10_000) });
    if (!r.ok) return { error: "refused" };
    for (const it of items) logLine({ dir: "out", device: tokenOf(deviceId) ? deviceId.slice(0, 8) : "?", type: "note", name: it.name, outcome: "sent" });
    state.set("state", { ...read(), last: { ...read().last, [deviceId]: startedAt } });
    return { sent: items.length + data.tasks.length + data.events.length };
  } catch { return { error: "unreachable" }; }
}

/** Tasks and events changed since the last push. Tasks: a newer edit wins, which is the only place sync can replace anything. */
export const changedData = (since: number) => ({ tasks: listTasks().filter((t) => t.updated > since).slice(0, MAX_BATCH), events: listEvents().filter((e) => e.created > since).slice(0, MAX_BATCH) });
export function applyData(tasks: unknown, events: unknown): { tasks: number; events: number } {
  let t = 0, e = 0;
  if (Array.isArray(tasks)) for (const x of tasks.slice(0, MAX_BATCH)) if (x && typeof x === "object") { const r = importTask(x as never); if (r === "created" || r === "updated") t++; }
  if (Array.isArray(events)) for (const x of events.slice(0, MAX_BATCH)) if (x && typeof x === "object") { if (importEvent(x as never) === "created") e++; }
  return { tasks: t, events: e };
}

export function notesyncApi(app: Hono, isOperator: (c: import("hono").Context) => boolean, agentName: (c: import("hono").Context) => string | null, store: Store = defaultNotes) {
  app.post("/api/sync/notes", async (c) => {
    const dev = deviceByTokenName(agentName(c));
    if (!dev) return c.json({ error: "not_paired" }, 401);
    const b = await c.req.json().catch(() => ({})) as { notes?: unknown; tasks?: unknown; events?: unknown };
    touch(dev.id); return c.json({ ok: true, ...applyPushed(store, dev.name, b.notes), ...applyData(b.tasks, b.events) });
  });
  app.get("/api/sync/held", (c) => (isOperator(c) ? c.json(heldList().map(({ content, ...h }) => ({ ...h, preview: maskKeys(content).slice(0, 300) }))) : c.json({ error: "operator_only" }, 403)));
  app.post("/api/sync/held/:id/:act", (c) => {
    if (!isOperator(c)) return c.json({ error: "operator_only" }, 403);
    const all = heldList(), h = all.find((x) => x.id === c.req.param("id")); if (!h) return c.json({ error: "not_found" }, 404);
    if (c.req.param("act") === "release") applyPushed(store, h.from, [{ name: h.name, content: h.content }], false);
    else if (c.req.param("act") !== "discard") return c.json({ error: "bad_action" }, 400);
    heldStore.set("items", all.filter((x) => x.id !== h.id)); logLine({ dir: "in", device: h.from, type: "note", name: h.name, outcome: c.req.param("act") === "release" ? "released by you" : "discarded by you" });
    return c.json({ ok: true });
  });
  app.get("/api/sync/state", (c) => (isOperator(c) ? c.json(read().on) : c.json({ error: "operator_only" }, 403)));
  app.put("/api/sync/state/:id", async (c) => {
    if (!isOperator(c)) return c.json({ error: "operator_only" }, 403);
    const b = await c.req.json().catch(() => ({})) as { notes?: unknown };
    const s = read(); state.set("state", { ...s, on: { ...s.on, [c.req.param("id")]: b.notes === true } }); return c.json({ ok: true });
  });
  app.post("/api/sync/now/:id", async (c) => (isOperator(c) ? c.json(await pushTo(c.req.param("id"), store)) : c.json({ error: "operator_only" }, 403)));
}

/** The background loop: every minute, push to each device the person switched on. Started once by the server. */
export function startNoteSync(store: Store = defaultNotes): () => void {
  const id = setInterval(() => { for (const [dev, on] of Object.entries(read().on)) if (on) void pushTo(dev, store); }, 60_000);
  return () => clearInterval(id);
}
