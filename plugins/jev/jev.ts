// Jev (TypeSafe): a decision model. It writes nothing; it answers questions about a text (choice, score, yes/no) with a confidence.
// Price is per input token, answers are free (about 0.042 USD per million input tokens). Ported from NEXORA's jev.py, the request shape is the same.
export type Question = { type: "choice"; instructions?: string; criteria: Record<string, string> } | { type: "score"; instructions?: string; criteria?: string } | { type: "noul"; instructions: string };
export type Answer = { choice?: string; confidence?: number; score?: number; [k: string]: unknown };
export type Decision = { answers: Record<string, Answer>; cost: number };

export const URL = "https://api.typesafe.ai/v1/systemone", MODEL = "jev-latest", PRICE_PER_INPUT_TOKEN = 0.042 / 1_000_000;
export class JevError extends Error {}

/** One Jev request. `post` is injectable so it is testable without the network. */
export async function decide(key: string, state: string, questions: Record<string, Question>, post: typeof fetch = fetch): Promise<Decision> {
  let r: Response;
  try { r = await post(URL, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify({ model: MODEL, state, questions }), signal: AbortSignal.timeout(10_000) }); }
  catch { throw new JevError("Jev could not be reached."); }
  if ([401, 402, 403].includes(r.status)) throw new JevError("Jev refused the key (or the account is out of credit).");
  if (!r.ok) throw new JevError(`Jev answered ${r.status}.`);
  const d: any = await r.json().catch(() => null);
  if (!d?.answers) throw new JevError("Jev sent an answer this version does not understand.");
  const u = d.usage ?? {};
  return { answers: d.answers, cost: Number(u.cost ?? (Number(u.input_tokens) || 0) * PRICE_PER_INPUT_TOKEN) };
}

/** The daily spend guard: a decision is refused once the day's cost passes the cap, so a loop can never run up a bill. */
export const underCap = (spentToday: number, capUsd: number) => spentToday < capUsd;
