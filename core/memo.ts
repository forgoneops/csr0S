// A tiny time-boxed cache for slow probes (running `hermes --version`, asking a tool whether it is signed in). The same
// promise is shared by everyone who asks within the window, so nine crew engines cost one probe, not nine.
export function memoFor<T>(ms: number, fn: () => Promise<T>): () => Promise<T> {
  let at = 0, hit: Promise<T> | null = null;
  return () => {
    if (hit && Date.now() - at < ms) return hit;
    at = Date.now();
    hit = fn().catch((e) => { hit = null; throw e; });
    return hit;
  };
}

/** Stale-while-revalidate: the first call waits, later calls answer at once with the last value and refresh it in the
 *  background once `ms` has passed. `warm()` fills it ahead of the first request so nobody waits on a slow probe. */
export function swrFor<T>(ms: number, fn: () => Promise<T>): (() => Promise<T>) & { warm: () => void } {
  let at = 0, val: T | undefined, has = false, busy: Promise<T> | null = null;
  const refresh = () => (busy ??= fn().then((v) => { val = v; has = true; at = Date.now(); return v; }).finally(() => { busy = null; }));
  const get = () => {
    if (has && Date.now() - at > ms) void refresh().catch(() => {});
    return has ? Promise.resolve(val as T) : refresh();
  };
  return Object.assign(get, { warm: () => void refresh().catch(() => {}) });
}
