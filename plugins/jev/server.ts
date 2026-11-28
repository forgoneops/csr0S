// Jev: the decision service. GET /status (key set or not, spend today, cap), PUT /key and DELETE /key (operator), PUT /cap (operator, USD per day).
// Other plugins call decideFor(ctx) instead of holding a key; the key never leaves the server and is never returned.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { PluginContext } from "../../core/plugins";
import { access } from "../../core/principal";
import { DATA } from "../../core/db";
import { getKey, hasKey, removeKey, saveKey } from "../../core/service-keys";
import { recordUsage, spentToday } from "../../core/service-usage";
import { decide, JevError, PRICE_PER_INPUT_TOKEN, underCap, type Question } from "./jev";

export default function (ctx: PluginContext) {
  const spent = () => spentToday(DATA, "jev");
  const cap = () => ctx.store.get<number>("cap", 0.5);
  const op = (c: any) => access.principal(c).kind === "operator";
  /** One decision with the key, the daily cap and the cost log applied. Throws JevError when off, over the cap or unreachable. */
  const ask = async (state: string, questions: Record<string, Question>) => {
    const k = getKey(DATA, "jev"); if (!k) throw new JevError("Add your Jev key in Settings first.");
    if (!underCap(spent(), cap())) throw new JevError("Jev's daily cap is reached.");
    const d = await decide(k, state.slice(0, 6000), questions);
    recordUsage(DATA, "jev", { usd: d.cost, units: Math.round(d.cost / PRICE_PER_INPUT_TOKEN) });
    return d;
  };
  // The turn monitor: after each finished turn of Caesar, Jev says whether it reported work done or only described a plan. Verdicts go to a ledger (GET /turns); a confident "plan only" also reaches the owner, at most once in 30 minutes.
  const ledger = join(ctx.dataDir, "turns.jsonl"); let lastPing = 0;
  const VERDICTS = { executed: "The reply reports work that was actually carried out, with concrete results (files changed, tests run, items finished).", plan_only: "The reply only describes what will be done or proposes a plan, without reporting finished work.", asks_user: "The reply mainly asks the user a question or for a decision.", blocked: "The reply says it could not proceed (error, missing access, refusal).", chat: "A conversational answer; no work was requested." };
  ctx.listen(async (type, data: any) => {
    if (type !== "agents.message" || data?.agent !== "hermes" || String(data?.text ?? "").length < 200 || !hasKey(DATA, "jev")) return;
    try {
      const d = await ask(`Request: ${String(data.title ?? "").slice(0, 200)}\n\nReply:\n${String(data.text).slice(0, 1500)}`, { turn: { type: "choice", instructions: "What kind of reply is this?", criteria: VERDICTS } });
      const a = d.answers.turn ?? {}, verdict = String(a.choice ?? "unknown"), conf = Number(a.confidence ?? 0);
      mkdirSync(ctx.dataDir, { recursive: true }); appendFileSync(ledger, JSON.stringify({ at: Date.now(), thread: data.thread, surface: data.surface, title: String(data.title ?? "").slice(0, 120), verdict, conf }) + "\n");
      if (verdict === "plan_only" && conf >= 0.8 && Date.now() - lastPing > 30 * 60_000) { lastPing = Date.now(); ctx.publish("plan-only", { thread: data.thread, title: data.title }); await fetch(`http://127.0.0.1:${process.env.CAESAR_PORT ?? "4400"}/api/p/notify/announce`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "Caesar only described a plan", body: `“${String(data.title ?? "").slice(0, 100)}”: Jev reads the reply as a plan, not finished work (${Math.round(conf * 100)}%).` }), signal: AbortSignal.timeout(5000) }).catch(() => {}); }
    } catch { /* the monitor never disturbs a turn */ }
  });
  ctx.routes.get("/turns", (c) => { const n = Math.min(200, Math.max(1, Number(c.req.query("limit")) || 50)); try { return c.json(existsSync(ledger) ? readFileSync(ledger, "utf8").trim().split("\n").filter(Boolean).slice(-n).map((l) => JSON.parse(l)).reverse() : []); } catch { return c.json([]); } });
  ctx.routes.get("/status", (c) => c.json({ keySet: hasKey(DATA, "jev"), spentTodayUsd: Math.round(spent() * 1e6) / 1e6, capUsd: cap() }));
  ctx.routes.put("/key", async (c) => {
    if (!op(c)) return c.json({ error: "only the operator can set the Jev key" }, 403);
    const b = await c.req.json<{ key?: string }>().catch(() => ({} as { key?: string }));
    try { saveKey(DATA, "jev", String(b.key ?? "")); return c.json({ keySet: true }); } catch (e) { return c.json({ error: (e as Error).message }, 400); }
  });
  ctx.routes.delete("/key", (c) => { if (!op(c)) return c.json({ error: "only the operator can remove the Jev key" }, 403); removeKey(DATA, "jev"); return c.json({ keySet: false }); });
  ctx.routes.put("/cap", async (c) => {
    if (!op(c)) return c.json({ error: "only the operator can change the cap" }, 403);
    const n = Number((await c.req.json<{ usd?: number }>().catch(() => ({} as { usd?: number }))).usd);
    if (!Number.isFinite(n) || n < 0 || n > 100) return c.json({ error: "a cap between 0 and 100 USD" }, 400);
    ctx.store.set("cap", n); return c.json({ capUsd: n });
  });
  // The tone a reply should be spoken in (Fish performs these). One call per reply; "neutral" when Jev is not sure.
  ctx.routes.post("/tone", async (c) => {
    if (!op(c)) return c.json({ error: "only the operator can ask Jev" }, 403);
    const b = await c.req.json<{ text?: string }>().catch(() => ({} as { text?: string }));
    try {
      const d = await ask(String(b.text ?? "").slice(0, 1500), { tone: { type: "choice", instructions: "In what tone should this reply be spoken aloud?", criteria: { calm: "Neutral, informative, everyday.", happy: "Good news, friendly.", excited: "Big success or something to celebrate.", confident: "Firm decision or clear recommendation.", empathetic: "Bad news, a problem, someone struggling.", curious: "A question or an open idea.", surprised: "Unexpected result.", satisfied: "Task done, closing." } } });
      const a = d.answers.tone ?? {}; return c.json({ tone: (a.confidence ?? 0) >= 0.6 ? a.choice : "calm", confidence: a.confidence ?? 0 });
    } catch (e) { return c.json({ error: (e as Error).message }, 502); }
  });
  // A plain pick among options, for other plugins (mail piles, routing): {state, instruction?, options: {id: description}} -> {choice, confidence}. Below `min` (default 0.6) the choice is null: the caller keeps its own answer.
  ctx.routes.post("/choose", async (c) => {
    if (!op(c)) return c.json({ error: "only the operator can ask Jev" }, 403);
    const b = await c.req.json<{ state?: string; instruction?: string; options?: Record<string, string>; min?: number }>().catch(() => ({} as any));
    const ids = Object.keys(b.options ?? {}); if (ids.length < 2 || ids.length > 255) return c.json({ error: "give 2 to 255 options" }, 400);
    try {
      const d = await ask(String(b.state ?? ""), { pick: { type: "choice", instructions: String(b.instruction ?? "Which option fits best?").slice(0, 400), criteria: { ...b.options, unknown: "None of the above, or too little to tell." } } });
      const a = d.answers.pick ?? {}, ok = a.choice && a.choice !== "unknown" && ids.includes(a.choice) && (a.confidence ?? 0) >= (b.min ?? 0.6);
      return c.json({ choice: ok ? a.choice : null, confidence: a.confidence ?? 0 });
    } catch (e) { return c.json({ error: (e as Error).message }, 502); }
  });
  ctx.routes.post("/decide", async (c) => {
    if (!op(c)) return c.json({ error: "only the operator can ask Jev from outside" }, 403);
    const b = await c.req.json<{ state?: string; questions?: Record<string, Question> }>().catch(() => ({} as any));
    try { return c.json(await ask(String(b.state ?? ""), b.questions ?? {})); } catch (e) { return c.json({ error: (e as Error).message }, e instanceof JevError ? 502 : 500); }
  });
}
