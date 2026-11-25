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
