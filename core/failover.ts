// Engine failover (plan 7.8): when an engine hits a limit, an outage or a sign-in problem BEFORE it has shown the person
// anything, the turn moves to the next engine in the fixed order and the failed one rests for a time that depends on the
// reason. Once an answer has started the turn is never switched (two engines would mix their words).
// shortcut: the rest times are in memory and reset on restart; persist them if restarts become common.
import type { ChatMessage, EngineAdapter, EngineEvent } from "./engines";
import { scopeOf } from "./scope";

export type Reason = "limit" | "auth" | "outage";
const REST_MS: Record<Reason, number> = { limit: 15 * 60_000, auth: 30 * 60_000, outage: 2 * 60_000 };
const RULES: [Reason, RegExp][] = [
  ["limit", /rate.?limit|usage limit|quota|too many requests|(?:http|status|error|code)\W{0,3}429\b|credits|exhaust/i],
  ["auth", /sign.?in|log.?in|unauthori[sz]ed|(?:http|status|error|code)\W{0,3}40[13]\b|credential|api key|not authenticated/i],
  ["outage", /ECONN(REFUSED|RESET)|ETIMEDOUT|timed? ?out|fetch failed|(?:http|status|error|code)\W{0,3}5\d\d\b|\b5\d\d (?:internal|bad gateway|service|gateway)|unavailable|overloaded|not installed|not detected/i],
];
/** Why an engine failed, or null when the failure is not one a different engine would fix (a bad request, a refusal). */
export const classify = (message: string): Reason | null => RULES.find(([, re]) => re.test(message))?.[0] ?? null;

const resting = new Map<string, { until: number; reason: Reason }>();
export const rest = (id: string, reason: Reason, now = Date.now()) => void resting.set(id, { until: now + REST_MS[reason], reason });
export const restingUntil = (id: string, now = Date.now()): { until: number; reason: Reason } | null => { const r = resting.get(id); return r && r.until > now ? r : null; };
export const resetRest = () => resting.clear();

/** The fixed order of 7.9: a Hermes profile (Caesar first), Claude Code, Codex, Ollama, then anything else. */
const FIXED = ["claude", "codex", "ollama"];
export function order(engines: EngineAdapter[]): EngineAdapter[] {
  const rank = (e: EngineAdapter) => e.id === "hermes:caesar" ? 0 : e.id.startsWith("hermes:") ? 1 : FIXED.includes(e.id) ? 2 + FIXED.indexOf(e.id) : 10;
  return [...engines].sort((a, b) => rank(a) - rank(b));
}

export type Switch = { from: string; to: string; reason: Reason | "local-only"; model: string };
/** Stream from `primary`; on a recoverable failure before any output, try the next usable engine. `others` is every other engine.
 *  A chat that began on a local engine never moves to the cloud by itself (its whole history would leave the machine) unless `allowCloud`.
 *  The switch is announced once, for the engine that actually starts answering, with that engine's own model. */
export async function* failoverStream(
  primary: EngineAdapter, others: EngineAdapter[], messages: ChatMessage[],
  opts: { model: string; signal?: AbortSignal; think?: boolean; localOnly?: boolean; allowCloud?: boolean; onSwitch?: (s: Switch) => void; now?: () => number },
): AsyncIterable<EngineEvent> {
  const now = opts.now ?? Date.now;
  const wantsImages = messages.some((m) => m.images?.length), primaryLocal = scopeOf(primary) === "local";
  const pool = others.filter((e) => e.id !== primary.id && (!wantsImages || e.vision) && (opts.allowCloud || !primaryLocal || scopeOf(e) === "local"));
  let queue = [primary, ...order(pool)];
  // "Local only": cloud engines never get the turn, not even the one the chat was opened with.
  if (opts.localOnly) queue = queue.filter((e) => scopeOf(e) === "local");
  if (!queue.length) throw new Error("Local only is on and no local engine can answer. Start Ollama or a local model server, or switch Local only off.");
  let model = opts.model, last: unknown;
  let failed: { id: string; reason: Reason | "local-only" } | null = opts.localOnly && scopeOf(primary) === "cloud" ? { id: primary.id, reason: "local-only" } : null;
  for (const eng of queue) {
    if (eng.id !== primary.id) {
      if (restingUntil(eng.id, now())) continue;
      const h = await eng.health({ signal: opts.signal }).catch(() => ({ ok: false, detail: null }));
      if (!h.ok) continue;
      model = (await eng.models({ signal: opts.signal }).catch(() => []))[0]?.id ?? "default";
      if (failed) opts.onSwitch?.({ from: failed.id, to: eng.id, reason: failed.reason, model });
    }
    let shown = false;
    try {
      for await (const ev of eng.stream(messages, { ...opts, model })) { if (ev.type !== "done") shown = true; yield ev; }
      return;
    } catch (e) {
      const reason = classify(e instanceof Error ? e.message : String(e));
      if (shown || !reason || opts.signal?.aborted) throw e;             // output already started, or not an engine problem
      rest(eng.id, reason, now()); last = e; failed = { id: eng.id, reason };
    }
  }
  throw last ?? new Error("no engine can answer");
}
