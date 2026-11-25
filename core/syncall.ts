// "Sync now": one full round with every paired device that has sync switched on, for notes, tasks and events and for conversations,
// and a record of the last round so the person can see what moved, what failed and when.
import type { Context, Hono } from "hono";
import { kv } from "./db";
import { pushChats, chatsOn } from "./chatsync";
import { notesOn, pushTo } from "./notesync";
import { tokenOf } from "./pairing";

export type Part = { sent: number } | { error: string };
export type DeviceRound = { id: string; notes?: Part; chats?: Part };
export type Round = { at: number; devices: DeviceRound[]; note?: string; ok: boolean };
const state = kv("syncall");
export const lastRound = (): Round | null => state.get<Round | null>("last", null);

/** A round is ok when nothing in it failed. An empty round (nothing switched on) is not an error, it says what to do. */
export const roundOk = (devices: DeviceRound[]) => devices.every((d) => ![d.notes, d.chats].some((p) => p && "error" in p));

export async function syncAll(now = Date.now(), pushNotes = pushTo, pushChat = pushChats): Promise<Round> {
  const n = notesOn(), c = chatsOn(), ids = [...new Set([...Object.keys(n).filter((k) => n[k]), ...Object.keys(c).filter((k) => c[k])])].filter((id) => tokenOf(id));
  const devices: DeviceRound[] = [];
  for (const id of ids) {
    const row: DeviceRound = { id };
    if (n[id]) row.notes = await pushNotes(id);
    if (c[id]) row.chats = await pushChat(id);
    devices.push(row);
  }
  const r: Round = { at: now, devices, ok: roundOk(devices), ...(devices.length ? {} : { note: "Switch sync on for a paired device first." }) };
  state.set("last", r);
  return r;
}

let running = false;
export const syncApi = (app: Hono, isOperator: (c: Context) => boolean) => {
  app.get("/api/sync/status", (c) => (isOperator(c) ? c.json({ last: lastRound(), running }) : c.json({ error: "operator_only" }, 403)));
  app.post("/api/sync/all", async (c) => {
    if (!isOperator(c)) return c.json({ error: "operator_only" }, 403);
    if (running) return c.json({ error: "busy" }, 429);
    running = true;
    try { return c.json(await syncAll()); } finally { running = false; }
  });
};
