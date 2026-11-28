// Which Claude Code account takes the next turn. Pure: the same inputs give the same answer, so it is tested without any account.
// A window is what Claude Code reports with each turn (rate_limit_event): used 0..1, when it resets, and a status.
export type Win = { used: number; resetsAt: number | null; status?: string };
export type Windows = Record<string, Win>;
export type Account = { id: string; label: string; configDir: string; enabled: boolean };
export type State = { windows?: Windows; windowsAt?: number; limitedUntil?: number; loggedIn?: boolean };
export type Mode = "failover" | "balance";
export type Choice = { id: string; reason: string; allLimited: boolean };

/** Until when is this account closed to new turns? 0 when it is open. A rejected window counts, and so does a window that is full. */
export function closedUntil(s: State | undefined, now: number): number {
  let until = s?.limitedUntil && s.limitedUntil > now ? s.limitedUntil : 0;
  for (const w of Object.values(s?.windows ?? {})) {
    const full = w.status === "rejected" || w.used >= 0.995;
    if (full && w.resetsAt && w.resetsAt > now) until = Math.max(until, w.resetsAt);
  }
  return until;
}

const five = (s?: State) => s?.windows?.five_hour?.used ?? 0;

/** The first open account in order (failover), or the open one with the emptiest 5-hour window (balance). If every account is closed,
 *  the one that opens first, and `allLimited` says so. Accounts known not to be signed in are never chosen while another can be. */
export function choose(accounts: Account[], states: Record<string, State | undefined>, now: number, mode: Mode = "failover"): Choice | null {
  const live = accounts.filter((a) => a.enabled);
  if (!live.length) return null;
  const usable = live.filter((a) => states[a.id]?.loggedIn !== false);
  const pool = usable.length ? usable : live;
  const open = pool.filter((a) => closedUntil(states[a.id], now) === 0);
  if (open.length) {
    const pick = mode === "balance" ? [...open].sort((a, b) => five(states[a.id]) - five(states[b.id]))[0] : open[0];
    const first = live[0].id;
    return { id: pick.id, allLimited: false, reason: pick.id === first ? "the first account is open" : `${live.find((a) => a.id === first)?.label ?? first} is closed or not signed in, so ${pick.label} takes the turn` };
  }
  const soonest = [...pool].sort((a, b) => closedUntil(states[a.id], now) - closedUntil(states[b.id], now))[0];
  return { id: soonest.id, allLimited: true, reason: `every account is at its limit; ${soonest.label} opens first` };
}

/** A limit message from Claude Code (the text of a failed turn). */
export const isLimitText = (text: string) => /usage limit|rate.?limit|hit your limit|limit reached|5-hour|quota/i.test(text);

/** The earliest reset among the windows that are full: what a failed turn tells us about when the account reopens. */
export function resetFrom(windows: Windows | undefined, now: number): number | null {
  const times = Object.values(windows ?? {}).filter((w) => (w.status === "rejected" || w.used >= 0.995) && w.resetsAt && w.resetsAt > now).map((w) => w.resetsAt as number);
  return times.length ? Math.max(...times) : null;
}
