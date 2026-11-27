// Goals use civil dates so daylight-saving transitions cannot move a period.
export type Horizon = "day" | "week" | "month" | "quarter";
export type Goal = { id: string; title: string; notes: string; horizon: Horizon; status: "active" | "done"; start: string; end: string; updatedAt: number; renewedFrom?: string };
export const HORIZONS: Horizon[] = ["day", "week", "month", "quarter"];
export function periodOf(horizon: Horizon, date: string): { start: string; end: string } {
  const d = new Date(`${date}T12:00:00Z`), start = new Date(d), end = new Date(d);
  if (horizon === "week") { start.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); end.setTime(start.getTime()); end.setUTCDate(start.getUTCDate() + 6); }
  else if (horizon === "month" || horizon === "quarter") { const m = horizon === "quarter" ? Math.floor(d.getUTCMonth() / 3) * 3 : d.getUTCMonth(); start.setUTCDate(1); start.setUTCMonth(m); end.setTime(start.getTime()); end.setUTCMonth(m + (horizon === "quarter" ? 3 : 1), 0); }
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}
export function localDate(now = new Date(), tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC") {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (kind: string) => parts.find(x => x.type === kind)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export const stateOf = (g: Pick<Goal, "start" | "end">, today: string) => today < g.start ? "future" : today > g.end ? "past" : "current";
export function make(horizon: Horizon, title: string, today: string, id: string, now = Date.now()): Goal {
  const clean = title.trim().slice(0, 200);
  if (!HORIZONS.includes(horizon)) throw new Error("Choose day, week, month or quarter.");
  if (!clean) throw new Error("A goal needs a title.");
  return { id, title: clean, notes: "", horizon, status: "active", ...periodOf(horizon, today), updatedAt: now };
}
export function carryOver(goals: Goal[], today: string, newId: () => string, now = Date.now()): Goal[] {
  const renewed = new Set(goals.map(g => g.renewedFrom).filter(Boolean));
  return goals.filter(g => g.status === "active" && stateOf(g, today) === "past" && !renewed.has(g.id) && !goals.some(n => n.renewedFrom === g.id))
    .map(g => ({ ...g, id: newId(), status: "active" as const, ...periodOf(g.horizon, today), renewedFrom: g.id, updatedAt: now }));
}
export function streak(goals: Goal[], horizon: Horizon, today: string): number {
  const byStart = new Map<string, Goal[]>();
  for (const goal of goals) if (goal.horizon === horizon) byStart.set(goal.start, [...(byStart.get(goal.start) || []), goal]);
  const previous = (date: string) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - 1); return periodOf(horizon, d.toISOString().slice(0, 10)).start; };
  const complete = (start: string) => { const goals = byStart.get(start); return !!goals?.length && goals.every(g => g.status === "done"); };
  let cursor = periodOf(horizon, today).start, count = 0;
  if (!complete(cursor)) cursor = previous(cursor);
  while (complete(cursor)) { count++; cursor = previous(cursor); }
  return count;
}
