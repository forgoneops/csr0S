// S4: the terminal. One PTY per session, streamed over one WebSocket, with an audit row when a
// session opens and when it ends. This is core code and not a module page: the terminal is a shell
// placement (bottom pane, right side, tab), so it lives beside the server, not at a module URL.
//
// Three rules hold it down:
//   1. It is off in the client edition. That is an edition setting at run time, not a build trick.
//   2. It needs the operator's own browser. An agent token, an anonymous request or a PIN never
//      opens it; there is no PIN anywhere in CaesarOS (R27).
//   3. It answers loopback and private or tailnet addresses only. Sign-in off loopback is decision
//      D5 and is still open, so a public address is refused rather than guessed at.
//
// One viewer per session. When the browser hides the pane the WebSocket may drop and the shell keeps
// running; output is kept in a bounded backlog (BACKLOG_BYTES) and replayed when the pane returns.
import type { Context, Hono } from "hono";
import { record, tryRecord, type AuditRow } from "./audit";
import { access, knownHost, type Principal } from "./principal";
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA } from "./db";
import { isLocal, onRevoke } from "./webgate";

export const DEFAULT_IDLE_MS = 15 * 60_000;
export const DEFAULT_MAX_SESSIONS = 4;
export const BACKLOG_BYTES = 64 * 1024;
export const PARK_MS = 10_000, HISTORY_LINES = 2000, HISTORY_CHARS = 400_000, MAX_RECOVERABLE = 8, HISTORY_KEEP_MS = 7 * 864e5;
const SAFE_ID = /^[A-Za-z0-9_-]{8,64}$/;
const MAX_COLS = 400, MAX_ROWS = 200, MIN_COLS = 2, MIN_ROWS = 2, MAX_MESSAGE = 256 * 1024;

/** The client edition never runs the terminal (R26, R45). Unmarked builds are the owner build. */
export const terminalOff = (edition: string | undefined = process.env.CAESAROS_EDITION): boolean =>
  edition === "standard" || edition === "consumer";

/** Loopback, RFC1918 private space, link-local, IPv6 unique/link-local and the tailnet CGNAT range
 *  100.64.0.0/10 (D5: tailnet only until sign-in is decided). Everything else is refused. */
export function addressAllowed(address: string | null | undefined): boolean {
  if (!address) return true; // in-process request: tests and server-side calls have no peer address
  const ip = address.trim().replace(/^::ffff:/i, "");
  if (ip === "::1" || ip === "0:0:0:0:0:0:0:1") return true;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (v4) {
    const a = Number(v4[1]), b = Number(v4[2]);
    return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127);
  }
  return /^f[cd][0-9a-f]{2}:/i.test(ip) || /^fe[89ab][0-9a-f]:/i.test(ip);
}

export type TerminalGate = { edition?: string; principal: Principal["kind"]; address?: string | null; host?: string | null };
export type GateResult = { ok: true } | { ok: false; status: 403 | 404 | 421; error: string };

/** The whole permission story in one pure function, so the test and the route cannot disagree. */
export function terminalGate(g: TerminalGate): GateResult {
  if (terminalOff(g.edition)) return { ok: false, status: 404, error: "the terminal is not part of this edition" };
  if (!knownHost(g.host ?? undefined)) return { ok: false, status: 421, error: "unknown host" };
  if (!addressAllowed(g.address)) return { ok: false, status: 403, error: "the terminal answers loopback or a private address only" };
  if (g.principal !== "operator") return { ok: false, status: 403, error: "the terminal is the operator's own: open it from this machine's browser" };
  return { ok: true };
}

export type PtyHandle = {
  write(data: string | Uint8Array): void;
  resize(cols: number, rows: number): void;
  close(): void;
};

type Socket = {
  data: { id: string; remote?: boolean };
  send(data: string | Uint8Array): void;
  close(code?: number, reason?: string): void;
};

export type PtySpec = {
  cols: number; rows: number; cwd: string;
  onData(chunk: Uint8Array): void;
  onExit(code: number): void;
};

/** The real PTY: Bun gives a subprocess a terminal, so the shell sees a TTY and its output arrives
 *  byte for byte. The callbacks are per spawn, which is what keeps the manager testable. */
export function spawnPty(spec: PtySpec): PtyHandle {
  const shell = process.env.SHELL || "/bin/bash";
  const proc = Bun.spawn([shell, "-i"], {
    cwd: spec.cwd,
    env: { ...process.env, TERM: "xterm-256color" },
    terminal: {
      cols: spec.cols, rows: spec.rows, name: "xterm-256color",
      data: (_t, data) => spec.onData(data),
      exit: (_t, code) => spec.onExit(code),
    },
  });
  return {
    write: (data) => { proc.terminal?.write(data); },
    resize: (cols, rows) => { proc.terminal?.resize(cols, rows); },
    close: () => { try { proc.terminal?.close(); } catch { /* already closed */ } try { proc.kill(); } catch { /* already gone */ } },
  };
}

export type TerminalDeps = {
  create?: (spec: PtySpec) => PtyHandle;
  now?: () => number;
  idleMs?: number;
  maxSessions?: number;
  cwd?: string;
  audit?: (row: AuditRow) => void;
  /** how long a closed shell stays alive and hidden so the close can be undone */
  parkMs?: number;
  /** where the last lines of every session are saved so they survive a restart (private, 0600) */
  dir?: string;
};

type Session = {
  id: string; cols: number; rows: number;
  createdAt: number; lastSeen: number;
  pty: PtyHandle; socket: Socket | null;
  backlog: Uint8Array[]; backlogBytes: number;
  closed: boolean;
  parkedUntil: number | null;
  /** the last lines of output as text, for the saved history */
  lines: string[]; partial: string; decoder: TextDecoder; dirty: boolean;
};

export type TerminalInfo = {
  id: string; cols: number; rows: number; attached: boolean;
  createdAt: number; lastSeen: number; backlogBytes: number; parked: boolean;
};

export class TerminalError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

const clamp = (n: unknown, min: number, max: number, fallback: number): number => {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.round(n) : fallback;
  return Math.min(max, Math.max(min, v));
};

/** Sessions in one process. The class owns everything that must end: the pty, the socket, the
 *  backlog and the audit row. Tests drive it with a fake pty and a fake clock. */
export class TerminalSessions {
  private readonly sessions = new Map<string, Session>();
  constructor(private readonly deps: TerminalDeps = {}) {}

  private now(): number { return this.deps.now?.() ?? Date.now(); }
  private write(row: AuditRow): void { (this.deps.audit ?? record)(row); }
  idle(): number { return this.deps.idleMs ?? Number(process.env.CAESAROS_TERMINAL_IDLE_MS ?? DEFAULT_IDLE_MS); }
  max(): number { return this.deps.maxSessions ?? DEFAULT_MAX_SESSIONS; }
  size(): number { return this.sessions.size; }

  list(): TerminalInfo[] {
    return [...this.sessions.values()].map((s) => ({
      id: s.id, cols: s.cols, rows: s.rows, attached: !!s.socket,
      createdAt: s.createdAt, lastSeen: s.lastSeen, backlogBytes: s.backlogBytes, parked: s.parkedUntil !== null,
    }));
  }

  has(id: string): boolean { return this.sessions.has(id); }

  /** Open a session and write its audit row BEFORE the shell starts. If the row cannot be written,
   *  no shell is started: a session that cannot be recorded is not opened (the audit contract). */
  create(opts: { cols?: unknown; rows?: unknown; recover?: unknown } = {}): { id: string; cols: number; rows: number; idleMs: number } {
    if (this.sessions.size >= this.max()) throw new TerminalError(429, "the terminal already has as many sessions as it allows");
    const cols = clamp(opts.cols, MIN_COLS, MAX_COLS, 80);
    const rows = clamp(opts.rows, MIN_ROWS, MAX_ROWS, 24);
    const id = randomId();
    this.write({ source: "ui", actor: "operator", subjectKind: "terminal", subjectId: id, confidence: "seen", claim: `terminal session opened (${cols}x${rows})` });
    const session: Session = { id, cols, rows, createdAt: this.now(), lastSeen: this.now(), pty: undefined as unknown as PtyHandle, socket: null, backlog: [], backlogBytes: 0, closed: false, parkedUntil: null, lines: [], partial: "", decoder: new TextDecoder(), dirty: false };
    const old = typeof opts.recover === "string" ? this.readHistory(opts.recover) : null;
    if (old) this.seed(session, old.text);
    const pty = this.deps.create ?? spawnPty;
    try {
      session.pty = pty({
        cols, rows, cwd: this.deps.cwd ?? process.env.CAESAROS_TERMINAL_CWD ?? process.env.HOME ?? process.cwd(),
        onData: (chunk) => this.receive(session, chunk),
        onExit: (code) => this.end(session, `exited (${code})`),
      });
    } catch (e) {
      tryRecord({ source: "ui", actor: "operator", subjectKind: "terminal", subjectId: id, confidence: "blocked", claim: `terminal session could not start: ${(e as Error).message}` });
      throw new TerminalError(503, "the shell could not be started on this machine");
    }
    this.sessions.set(id, session);
    if (old) { this.forget(old.id); this.write({ source: "ui", actor: "operator", subjectKind: "terminal", subjectId: id, confidence: "seen", claim: `terminal history restored from ${old.id.slice(0, 8)}` }); }
    return { id, cols, rows, idleMs: this.idle() };
  }

  // ---- recovery: undo a close for 10 s, and keep the last 2000 lines across a restart ----
  private dir(): string { const d = this.deps.dir ?? join(DATA, "terminal"); mkdirSync(d, { recursive: true, mode: 0o700 }); return d; }
  private file(id: string): string { return join(this.dir(), `${id}.json`); }
  private forget(id: string): void { if (SAFE_ID.test(id)) rmSync(this.file(id), { force: true }); }
  private readHistory(id: string): { id: string; text: string; savedAt: number } | null {
    if (!SAFE_ID.test(id) || this.sessions.has(id) || !existsSync(this.file(id))) return null;
    try { const j = JSON.parse(readFileSync(this.file(id), "utf8")) as { text?: unknown; savedAt?: unknown }; return typeof j.text === "string" ? { id, text: j.text.slice(-HISTORY_CHARS), savedAt: Number(j.savedAt) || 0 } : null; } catch { return null; }
  }
  /** Old output goes on screen dimmed, and into the new session's own history so it is saved again. */
  private seed(session: Session, text: string): void {
    const note = "\r\n\x1b[2m--- restored: the program that ran here did not survive the restart ---\x1b[0m\r\n";
    const bytes = new TextEncoder().encode("\x1b[0m\x1b[2m" + text.replace(/\n/g, "\r\n") + "\x1b[0m" + note);
    session.backlog = [bytes]; session.backlogBytes = bytes.byteLength; this.keep(session, text + "\n");
  }
  private keep(s: Session, decoded: string): void {
    const parts = (s.partial + decoded).split("\n"); s.partial = parts.pop() ?? ""; s.lines.push(...parts.map((l) => l.replace(/\r$/, "")));
    if (s.lines.length > HISTORY_LINES) s.lines.splice(0, s.lines.length - HISTORY_LINES);
    s.dirty = true;
  }
  /** Saved sessions with no live twin, newest first: what a restart left behind. */
  recoverable(): { id: string; savedAt: number; lines: number }[] {
    const out: { id: string; savedAt: number; lines: number }[] = [];
    for (const f of readdirSync(this.dir())) {
      const id = f.replace(/\.json$/, ""), h = f.endsWith(".json") ? this.readHistory(id) : null; if (!h) continue;
      if (this.now() - h.savedAt > HISTORY_KEEP_MS) { this.forget(id); continue; }
      out.push({ id, savedAt: h.savedAt, lines: h.text.split("\n").length });
    }
    return out.sort((a, b) => b.savedAt - a.savedAt).slice(0, MAX_RECOVERABLE);
  }
  /** Write every session that produced output since the last save; atomic, private. Called every 30 s. */
  saveHistory(): number {
    let n = 0;
    for (const s of this.sessions.values()) {
      if (!s.dirty) continue;
      const text = (s.lines.join("\n") + (s.lines.length ? "\n" : "") + s.partial).slice(-HISTORY_CHARS), f = this.file(s.id), tmp = f + ".tmp";
      writeFileSync(tmp, JSON.stringify({ id: s.id, savedAt: this.now(), cols: s.cols, rows: s.rows, text }), { mode: 0o600 }); chmodSync(tmp, 0o600); renameSync(tmp, f); s.dirty = false; n++;
    }
    return n;
  }
  /** Hide a shell for PARK_MS instead of ending it; it keeps running and can be brought back. */
  park(id: string): boolean {
    const s = this.sessions.get(id); if (!s || s.closed) return false;
    s.parkedUntil = this.now() + (this.deps.parkMs ?? PARK_MS);
    if (s.socket) { try { s.socket.close(4002, "closed, undo possible for a few seconds"); } catch { /* gone */ } s.socket = null; }
    const timer = setTimeout(() => { if (s.parkedUntil !== null && !s.closed) this.end(s, "closed by the operator"); }, (this.deps.parkMs ?? PARK_MS) + 50);
    (timer as unknown as { unref?: () => void }).unref?.();
    return true;
  }
  restore(id: string): boolean {
    const s = this.sessions.get(id); if (!s || s.closed || s.parkedUntil === null || this.now() > s.parkedUntil) return false;
    s.parkedUntil = null; s.lastSeen = this.now(); return true;
  }

  private receive(session: Session, chunk: Uint8Array): void {
    if (session.closed) return;
    this.keep(session, session.decoder.decode(chunk, { stream: true }));
    if (session.socket) { session.socket.send(chunk); return; }
    session.backlog.push(chunk);
    session.backlogBytes += chunk.byteLength;
    while (session.backlogBytes > BACKLOG_BYTES && session.backlog.length > 1) {
      const dropped = session.backlog.shift();
      session.backlogBytes -= dropped?.byteLength ?? 0;
    }
    if (session.backlogBytes > BACKLOG_BYTES) {
      // a single write larger than the backlog: keep its tail, never grow without a bound
      const only = session.backlog[0];
      const keep = only.subarray(only.byteLength - BACKLOG_BYTES);
      session.backlog = [keep];
      session.backlogBytes = keep.byteLength;
    }
  }

  /** Bind the one viewer. A second viewer takes the session over; the first socket is closed. */
  attach(id: string, socket: Socket): boolean {
    const s = this.sessions.get(id);
    if (!s || s.closed || s.parkedUntil !== null) return false;
    if (s.socket && s.socket !== socket) { try { s.socket.close(4001, "another viewer took this terminal"); } catch { /* already gone */ } }
    s.socket = socket;
    s.lastSeen = this.now();
    socket.send(JSON.stringify({ t: "ready", id: s.id, cols: s.cols, rows: s.rows, idleMs: this.idle() }));
    for (const chunk of s.backlog) socket.send(chunk);
    s.backlog = [];
    s.backlogBytes = 0;
    return true;
  }

  input(id: string, data: string | Uint8Array): boolean {
    const s = this.sessions.get(id);
    if (!s || s.closed || s.parkedUntil !== null) return false;
    if (typeof data === "string" && data.length > MAX_MESSAGE) return false;
    s.lastSeen = this.now();
    s.pty.write(data);
    return true;
  }

  resize(id: string, cols: unknown, rows: unknown): boolean {
    const s = this.sessions.get(id);
    if (!s || s.closed) return false;
    s.cols = clamp(cols, MIN_COLS, MAX_COLS, s.cols);
    s.rows = clamp(rows, MIN_ROWS, MAX_ROWS, s.rows);
    s.lastSeen = this.now();
    s.pty.resize(s.cols, s.rows);
    return true;
  }

  /** The web gate's key was rotated or revoked: remote viewers are cut off. The shells stay with this computer. */
  dropRemote(): void {
    for (const s of this.sessions.values()) if (s.socket?.data.remote) { try { s.socket.close(4003, "access revoked"); } catch { /* gone */ } s.socket = null; }
  }

  detach(id: string, socket: Socket): void {
    const s = this.sessions.get(id);
    if (!s || s.socket !== socket) return;
    s.socket = null;              // the shell keeps running; the backlog catches up on return
    s.lastSeen = this.now();
  }

  /** End a session: send the exit note, close the socket, kill the pty, keep the audit row. */
  close(id: string, reason = "closed"): boolean { const s = this.sessions.get(id); return s ? this.end(s, reason) : false; }

  private end(session: Session, reason: string): boolean {
    if (session.closed) return false;
    session.closed = true;
    this.sessions.delete(session.id);
    if (session.socket) {
      try { session.socket.send(JSON.stringify({ t: "exit", reason })); } catch { /* socket already gone */ }
      try { session.socket.close(1000, reason.slice(0, 100)); } catch { /* already closed */ }
    }
    try { session.pty.close(); } catch { /* already gone */ }
    if (reason !== "server stopped") { try { this.forget(session.id); } catch { /* nothing saved */ } }       // ended on purpose: its history goes too
    // The end row goes through the same sink as the open row; if it cannot be written, the cleanup
    // still happens (the shell is already dead) — but it is never silently invented.
    try { this.write({ source: "ui", actor: "operator", subjectKind: "terminal", subjectId: session.id, confidence: "done", claim: `terminal session ended: ${reason}` }); } catch { /* ledger down */ }
    return true;
  }

  /** Close every session idle longer than the timeout. Called on a timer and from tests. */
  tick(now = this.now()): number {
    let n = 0;
    for (const s of [...this.sessions.values()]) {
      if (s.parkedUntil !== null && now > s.parkedUntil) { this.end(s, "closed by the operator"); n++; }
      else if (s.parkedUntil === null && now - s.lastSeen >= this.idle()) { this.end(s, "idle timeout"); n++; }
    }
    return n;
  }

  shutdown(): void { this.saveHistory(); for (const s of [...this.sessions.values()]) this.end(s, "server stopped"); }
}

function randomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Buffer.from(bytes).toString("base64url");
}

/** Who is asking and from where. Bun hands the peer address to the route through `c.env.server`. */
type Peer = { address?: string | null } | undefined;

function gate(c: Context, peer: Peer): GateResult {
  if (overGateway(c)) return { ok: false, status: 403, error: NO_GATEWAY_TERMINAL };
  return terminalGate({
    edition: process.env.CAESAROS_EDITION,
    principal: access.principal(c).kind,
    address: peer?.address ?? null,
    host: c.req.header("host") ?? null,
  });
}

function peerOf(c: Context): Peer {
  const server = (c.env as { server?: { requestIP(req: Request): { address: string } | null } } | undefined)?.server;
  if (!server) return undefined;
  try { return { address: server.requestIP(c.req.raw)?.address ?? null }; } catch { return undefined; }
}

/** A WebSocket handshake is not a fetch: browsers always send `Origin` on it, but not necessarily
 *  the Sec-Fetch metadata a fetch carries. So the upgrade also accepts a same-origin Origin as the
 *  operator's proof. A presented token still wins and is still refused, and a cross-origin page is
 *  never same-origin, so a website cannot borrow the operator's browser. */
const sameOrigin = (origin: string | null | undefined, host: string | null | undefined): boolean => {
  if (!origin || !host) return false;
  try { const u = new URL(origin); return u.host === host && (u.protocol === "http:" || u.protocol === "https:"); } catch { return false; }
};

function socketGate(c: Context, peer: Peer): GateResult {
  if (overGateway(c)) return { ok: false, status: 403, error: NO_GATEWAY_TERMINAL };
  const principal = access.principal(c);
  const kind = principal.kind !== "anonymous" || c.req.header("authorization")
    ? principal.kind
    : sameOrigin(c.req.header("origin"), c.req.header("host")) ? "operator" : "anonymous";
  return terminalGate({ edition: process.env.CAESAROS_EDITION, principal: kind, address: peer?.address ?? null, host: c.req.header("host") ?? null });
}

const refuse = (c: Context, g: Extract<GateResult, { ok: false }>) => c.json({ error: g.error }, g.status);

/** The gateway's own plain-http listener has no terminal: it never carried the socket, so say so before a shell starts. */
const overGateway = (c: Context): boolean => !!(c.env as { gw?: boolean } | undefined)?.gw;
const NO_GATEWAY_TERMINAL = "the terminal works on the computer that runs CaesarOS, not over this gateway link";

/** The HTTP surface: state, open, end, and the WebSocket upgrade. */
export function terminalRoutes(app: Hono, sessions: TerminalSessions): void {
  app.get("/api/terminal", (c) => c.json({
    enabled: !terminalOff(),
    edition: terminalOff() ? "standard" : "owner",
    idleMs: sessions.idle(),
    maxSessions: sessions.max(),
    sessions: sessions.size(),
  }));

  app.post("/api/terminal/sessions", async (c) => {
    const g = gate(c, peerOf(c));
    if (!g.ok) return refuse(c, g);
    const body = await c.req.json<{ cols?: unknown; rows?: unknown }>().catch(() => ({}));
    try { return c.json(sessions.create(body)); }
    catch (e) { return c.json({ error: e instanceof TerminalError ? e.message : "the terminal could not start" }, (e instanceof TerminalError ? e.status : 500) as 400); }
  });

  // Close with a way back: the shell keeps running, hidden, for 10 seconds; restore brings it back.
  app.get("/api/terminal/sessions", (c) => { const g = gate(c, peerOf(c)); return g.ok ? c.json({ sessions: sessions.list(), recoverable: sessions.recoverable() }) : refuse(c, g); });
  app.post("/api/terminal/sessions/:id/park", (c) => { const g = gate(c, peerOf(c)); return !g.ok ? refuse(c, g) : sessions.park(c.req.param("id")) ? c.json({ parked: true, undoMs: PARK_MS }) : c.json({ error: "no such terminal session" }, 404); });
  app.post("/api/terminal/sessions/:id/restore", (c) => { const g = gate(c, peerOf(c)); return !g.ok ? refuse(c, g) : sessions.restore(c.req.param("id")) ? c.json({ restored: true }) : c.json({ error: "too late or no such session" }, 404); });
  app.delete("/api/terminal/sessions/:id", (c) => {
    const g = gate(c, peerOf(c));
    if (!g.ok) return refuse(c, g);
    const ended = sessions.close(c.req.param("id"), "closed by the operator");
    return ended ? c.json({ ended: true }) : c.json({ error: "no such terminal session" }, 404);
  });

  // The upgrade. Bun owns the socket; the policy above runs before it is allowed to happen.
  app.get("/api/terminal/ws", (c) => {
    const g = socketGate(c, peerOf(c));
    if (!g.ok) return refuse(c, g);
    const id = c.req.query("id") ?? "";
    if (!sessions.has(id)) return c.json({ error: "no such terminal session" }, 404);
    const server = (c.env as { server?: { upgrade(req: Request, opts: { data: { id: string; remote: boolean } }): boolean } } | undefined)?.server;
    if (!server) return c.json({ error: "this server is not answering WebSocket upgrades" }, 501);
    if (!server.upgrade(c.req.raw, { data: { id, remote: !isLocal(c) } })) return c.json({ error: "the WebSocket upgrade was refused" }, 400);
    return new Response(null, { status: 200 });
  });
}

/** The three socket events. Text frames are control messages; binary frames are keystrokes. */
export function terminalSocket(sessions: TerminalSessions) {
  return {
    open(ws: Socket) {
      if (!sessions.attach(ws.data.id, ws)) { try { ws.close(4004, "no such terminal session"); } catch { /* gone */ } }
    },
    message(ws: Socket, raw: string | Uint8Array) {
      if (typeof raw !== "string") { if (raw.length > MAX_MESSAGE) return; sessions.input(ws.data.id, raw); return; }
      if (raw.length > MAX_MESSAGE) return;
      let msg: { t?: string; d?: string; cols?: number; rows?: number };
      try { msg = JSON.parse(raw) as typeof msg; } catch { return; }
      if (msg.t === "in" && typeof msg.d === "string") sessions.input(ws.data.id, msg.d);
      else if (msg.t === "resize") sessions.resize(ws.data.id, msg.cols, msg.rows);
      else if (msg.t === "ping") { try { ws.send(JSON.stringify({ t: "pong", at: Date.now() })); } catch { /* gone */ } }
    },
    close(ws: Socket) { sessions.detach(ws.data.id, ws); },
  };
}

/** The instance for this install, and the timer that ends idle sessions. The timer is unreferenced:
 *  it never keeps the process (or a test run) alive. */
export const terminals = new TerminalSessions();

export function useTerminal(app: Hono, sessions: TerminalSessions = terminals): () => void {
  terminalRoutes(app, sessions);
  const unhook = onRevoke(() => sessions.dropRemote());
  const timer = setInterval(() => { sessions.tick(); try { sessions.saveHistory(); } catch (e) { console.warn("terminal history not saved:", (e as Error).message); } }, 30_000);
  (timer as unknown as { unref?: () => void }).unref?.();
  return () => { clearInterval(timer); unhook(); };
}
