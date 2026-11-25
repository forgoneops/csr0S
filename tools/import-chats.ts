#!/usr/bin/env bun
// Import chats from an older CAESAR database into a CaesarOS instance. Additive and repeatable: old ids are kept under an "old-" prefix and
// INSERT OR IGNORE skips what is already there, so running it twice changes nothing the second time. The old database is opened read-only.
// Imported chats arrive archived (out of the default list, still readable and searchable); Caesar keeps the context in the Brain.
// Only chats move (threads and messages). Settings, keys and other tables are not touched.
// Dry run by default. Usage:
//   CAESAROS_DATA=<instance data folder> bun tools/import-chats.ts <old caesar.db> [--apply]
import { Database } from "bun:sqlite";

const src = process.argv.slice(2).find((a) => !a.startsWith("--"));
const apply = process.argv.includes("--apply");
if (!src || !process.env.CAESAROS_DATA) { console.error("usage: CAESAROS_DATA=<instance data folder> bun tools/import-chats.ts <old caesar.db> [--apply]"); process.exit(2); }

const old = new Database(src, { readonly: true });
const { db } = await import("../core/db");
await import("../core/chat");                        // creates the chat tables the same way the core does

/** The old line named agents by profile; hermes meant Caesar, the operator. Engines here are hermes:<profile>. */
const engineOf = (agent: string) => (agent === "hermes" ? "hermes:caesar" : `hermes:${agent}`);
const threads = old.query("SELECT id, agent, title, updated, model FROM threads").all() as { id: string; agent: string; title: string; updated: number; model: string | null }[];
const msgs = old.query("SELECT id, thread, role, text, ts FROM messages ORDER BY thread, ts, rowid").all() as { id: string; thread: string; role: string; text: string; ts: number }[];
const byThread = new Map<string, typeof msgs>();
for (const m of msgs) (byThread.get(m.thread) ?? byThread.set(m.thread, []).get(m.thread)!).push(m);

const insS = db.prepare("INSERT OR IGNORE INTO chat_sessions (id, title, engine, model, created_at, updated_at, archived) VALUES (?,?,?,?,?,?,1)");
const insM = db.prepare("INSERT OR IGNORE INTO chat_messages (id, session_id, role, content, status, error, created_at, seq) VALUES (?,?,?,?, 'complete', NULL, ?, ?)");
let s = 0, m = 0;
const run = db.transaction(() => {
  for (const t of threads) {
    const list = byThread.get(t.id) ?? [];
    if (!list.length) continue;
    const id = `old-${t.id}`;
    const created = list[0]!.ts;
    if (apply) s += insS.run(id, (t.title || "Untitled").slice(0, 200), engineOf(t.agent), t.model ?? "", created, Math.max(t.updated ?? 0, list[list.length - 1]!.ts)).changes;
    else s++;
    list.forEach((x, i) => { if (apply) m += insM.run(`old-${x.id}`, id, x.role === "agent" ? "assistant" : "user", x.text ?? "", x.ts, i).changes; else m++; });
  }
});
run();
console.log(`${apply ? "IMPORTED" : "DRY RUN"}: ${s} chats, ${m} messages ${apply ? "written (already present ones skipped)" : "would be written"}`);
if (!apply) console.log("add --apply to write; nothing is changed without it");
