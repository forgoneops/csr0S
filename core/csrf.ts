// Cross-site request forgery guard. Any web page the person visits can make their browser send a "simple"
// request (text/plain body, no preflight) to this machine's loopback address. A write that arrives with
// an Origin that is not this server's own, or that the browser marks cross-site, is therefore refused.
// Callers that are not browsers (curl, local tools, tests) send neither header and are unaffected: they
// already hold the machine, and agents authenticate with a bearer token, not a cookie.
const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);
export const isWrite = (method: string): boolean => !SAFE.has(method.toUpperCase());

/** Origins besides the server's own that may write, e.g. behind a reverse proxy that rewrites Host. */
const extraOrigins = () => (process.env.CAESAROS_ORIGINS ?? "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);

/** Why a request must be refused, or null when it may proceed. */
export function crossSiteWrite(method: string, h: { origin?: string | null; host?: string | null; secFetchSite?: string | null }): string | null {
  if (SAFE.has(method.toUpperCase())) return null;
  if ((h.secFetchSite ?? "").toLowerCase() === "cross-site") return "cross-site request";
  const origin = h.origin?.trim();
  if (origin === undefined || origin === null || origin === "") return null;     // not a browser cross-origin write
  if (origin.toLowerCase() === "null") return "opaque origin";
  let o: URL;
  try { o = new URL(origin); } catch { return "malformed origin"; }
  if (h.host && o.host.toLowerCase() === h.host.trim().toLowerCase()) return null;
  if (extraOrigins().includes(o.origin.toLowerCase())) return null;
  return "foreign origin";
}
