import type { PluginContext } from "../../plugins";
import { db } from "../../db";
import { summarize, type ToolRun } from "./model";

type Row = { message_id: string; engine: string; created_at: number; tools: string };
// This read-only view uses the tool records already attached to local chat replies.
// The database remains the source of truth; no prompt, tool input/output, or session ID is returned.
export default function ({ routes }: PluginContext) {
  routes.get("/", (c) => {
    const at = Date.now(), since = at - 30 * 86400000;
    const rows = db.query<Row, [number]>(`SELECT m.id AS message_id, s.engine, m.created_at, m.tools
      FROM chat_messages m JOIN chat_sessions s ON s.id = m.session_id
      WHERE m.role = 'assistant' AND m.tools IS NOT NULL AND m.tools != '' AND m.created_at >= ?
      ORDER BY m.created_at ASC`).all(since);
    const runs: ToolRun[] = [];
    for (const row of rows) {
      let calls: unknown;
      try { calls = JSON.parse(row.tools); } catch { continue; }
      if (!Array.isArray(calls)) continue;
      const run: ToolRun = { id: row.message_id, agent: row.engine, status: "done", startedAt: row.created_at, steps: [] };
      for (const call of calls as { id?: unknown; name?: unknown; status?: unknown; ms?: unknown }[]) {
        if (!call || typeof call.name !== "string") continue;
        run.steps.push({ id: typeof call.id === "string" ? call.id : String(run.steps.length), kind: "tool", label: call.name, status: call.status === "error" ? "failed" : "done", ...(typeof call.ms === "number" ? { elapsedMs: call.ms } : {}) });
      }
      if (run.steps.length) runs.push(run);
    }
    return c.json({ at, ...summarize(runs) });
  });
}
