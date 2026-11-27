// Who is asking. Two kinds of principal may read private data: the OPERATOR (a real browser on this
// machine, proved by the Sec-Fetch headers every browser sends and a Host that is this machine's name)
// and an AGENT that presents a token the operator issued. Everyone else is refused with no data.
// Default deny. There is no PIN anywhere in CaesarOS (standing rule R27).
//
//   - An agent's identity comes from its token, never from a header or a field the caller types.
//   - Every private read by an agent is an audit row, written BEFORE the data is returned;
//     if the row cannot be written, nothing is returned (503).
import type { Context, MiddlewareHandler } from "hono";
import { record } from "./audit";
import type { KV } from "./db";

type Store = Pick<KV, "get" | "set">;
export type Principal = { kind: "operator" } | { kind: "agent"; name: string; scopes?: string[] } | { kind: "anonymous" };
export type AccessDeps = { tokens: Store; policy: Store; browserLike?(c: Context): boolean };
type TokenRecord = { name: string; at: number; scopes?: string[]; expiresAt?: number };

const sha = (s: string) => new Bun.CryptoHasher("sha256").update(s).digest("hex");
const prefixes = new Set<string>();

/** The names a browser may use for this machine. Any other name pointing here is a website rebound to
 *  127.0.0.1 or a tailnet address (DNS rebinding). IPs, localhost, one-word names and *.local pass;
 *  the person's own names go in CAESAROS_HOSTS (comma list). A request without a Host header passes:
 *  browsers always send one, tests and in-process calls do not. */
export function knownHost(h: string | undefined, extra = process.env.CAESAROS_HOSTS ?? ""): boolean {
  if (!h) return true;
  const host = h.trim().toLowerCase().replace(/:\d+$/, "").replace(/^\[(.*)\]$/, "$1");
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":") || host === "localhost" || !host.includes(".") || host.endsWith(".local") || extra.split(",").some((x) => x.trim().toLowerCase() === host);
}
/** Requests whose gateway cookie the web gate has just checked (core/webgate.ts). */
export const gatewayProven = new WeakSet<Request>();
// Browsers send Sec-Fetch-Site only to https and loopback. On the plain-http gateway the proof is the checked cookie
// instead; a write must also name this server as its Origin, which every browser sends on a write.
const provenByGateway = (c: Context): boolean => {
  if (!gatewayProven.has(c.req.raw) || c.req.header("sec-fetch-site") !== undefined) return false;
  const origin = c.req.header("origin"), safe = c.req.method === "GET" || c.req.method === "HEAD";
  if (origin === undefined) return safe;
  try { return new URL(origin).host === c.req.header("host"); } catch { return false; }
};
const browserLike = (c: Context) => (["same-origin", "same-site", "none"].includes(c.req.header("sec-fetch-site") ?? "") || provenByGateway(c)) && knownHost(c.req.header("host"));

export function createAccess(deps: AccessDeps) {
  const tokens = () => deps.tokens.get<Record<string, TokenRecord>>("tokens", {});
  const allowed = () => deps.policy.get<string[]>("private.agents", []);

  function bearer(c: Context): string | null {
    const h = c.req.header("authorization") ?? "";
    return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : null;
  }
  function principal(c: Context): Principal {
    const t = bearer(c);
    if (t) {
      const all = tokens(), hash = sha(t), row = all[hash];
      if (row && (!row.expiresAt || row.expiresAt > Date.now())) return { kind: "agent", name: row.name, ...(row.scopes ? { scopes: row.scopes } : {}) };
      if (row) { delete all[hash]; deps.tokens.set("tokens", all); }
    }
    return (deps.browserLike ?? browserLike)(c) ? { kind: "operator" } : { kind: "anonymous" };
  }
  /** Issue a token for an agent. It is shown once; only its hash is kept. A second token for the same agent replaces the first. */
  function issue(name: string): string {
    if (!/^[a-z0-9][a-z0-9_-]{1,40}$/.test(name)) throw new Error("an agent name is lowercase letters, digits, - or _");
    const all = tokens();
    for (const [h, r] of Object.entries(all)) if (r.name === name && !r.scopes) delete all[h];
    const token = `cae_${name}_${Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString("base64url")}`;
    all[sha(token)] = { name, at: Date.now() };
    deps.tokens.set("tokens", all);
    return token;
  }
  /** A short-lived token for an agent tool that must stay inside named private module scopes. */
  function issueScoped(name: string, scopes: string[], ttlMs = 24 * 60 * 60 * 1000): string {
    if (!/^[a-z0-9][a-z0-9_-]{1,40}$/.test(name)) throw new Error("an agent name is lowercase letters, digits, - or _");
    if (!Array.isArray(scopes) || !scopes.length || scopes.some((s) => !/^[a-z][a-z0-9-]{0,39}$/.test(s))) throw new Error("a scoped token needs valid private module names");
    if (!Number.isFinite(ttlMs) || ttlMs < 60_000 || ttlMs > 7 * 24 * 60 * 60 * 1000) throw new Error("a scoped token lifetime must be from one minute to seven days");
    const all = tokens(), now = Date.now();
    for (const [h, r] of Object.entries(all)) if (r.expiresAt !== undefined && r.expiresAt <= now) delete all[h];
    const token = `cae_${name}_${Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString("base64url")}`;
    all[sha(token)] = { name, at: now, scopes: [...new Set(scopes)], expiresAt: now + ttlMs };
    deps.tokens.set("tokens", all);
    return token;
  }
  function revoke(name: string): number {
    const all = tokens(); let n = 0;
    for (const [h, r] of Object.entries(all)) if (r.name === name) { delete all[h]; n++; }
    deps.tokens.set("tokens", all);
    return n;
  }
  const list = () => Object.values(tokens()).map((r) => ({ name: r.name, at: r.at }));
  const setAllowed = (names: string[]) => deps.policy.set("private.agents", names);
  /** Metadata of every issued token, newest first, for the operator's reach view. Never the token or its hash. */
  const inventory = () => Object.values(tokens()).map((r) => ({ name: r.name, issuedAt: r.at, scopes: r.scopes ? [...r.scopes] : null, expiresAt: r.expiresAt ?? null })).sort((a, b) => b.issuedAt - a.issuedAt);
  const allowedNames = () => [...allowed()];
  const registeredScopes = () => [...prefixes].map((p) => p.split("/")[3] ?? "").filter(Boolean).sort();

  /** A gate for a module's whole route group: routes.use("*", access.scope("notes")). */
  function scope(name: string, opts: { only?: string[] | (() => string[]) } = {}): MiddlewareHandler {
    prefixes.add(`/api/p/${name}/`);
    return async (c, next) => {
      const p = principal(c);
      const what = `${c.req.method} ${new URL(c.req.url).pathname}`;
      const refuse = (status: 401 | 403 | 503, error: string, who: string) => {
        record({ source: "tool", actor: who, subjectKind: name, subjectId: new URL(c.req.url).pathname, confidence: "blocked", claim: `refused: ${what} (${error})` });
        return c.json({ error }, status);
      };
      if (p.kind === "operator") return next();
      if (p.kind === "anonymous") return refuse(403, `${name} holds private data: only this machine's browser or an allowed agent's token may open it`, "anonymous");
      if (p.scopes && !p.scopes.includes(name)) return refuse(403, `${p.name}'s token is not scoped for ${name}`, p.name);
      const only = typeof opts.only === "function" ? opts.only() : opts.only ?? allowed();
      if (!only.includes(p.name)) return refuse(403, `${p.name} may not read ${name}`, p.name);
      try {
        record({ source: "tool", actor: p.name, subjectKind: name, subjectId: new URL(c.req.url).pathname, confidence: "seen", claim: `read ${name}: ${what}`, ref: `access:${name}:${Date.now()}` });
      } catch { return c.json({ error: "audit is not available, so no private data is returned" }, 503); }
      return next();
    };
  }
  /** May this request skip the global lock? Only a valid agent token, and only on a private path. */
  const passesGlobalLock = (c: Context, path: string) => [...prefixes].some((p) => path.startsWith(p)) && principal(c).kind === "agent";
  return { principal, issue, issueScoped, revoke, list, inventory, allowedNames, registeredScopes, setAllowed, scope, passesGlobalLock };
}

// ---- the instance for this install: tokens and policy in the core database
import { kv } from "./db";
export const access = createAccess({ tokens: kv("core.agent-tokens"), policy: kv("core.access") });
export const privateScope = access.scope;
