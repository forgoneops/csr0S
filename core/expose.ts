// Expose this install to another machine over the tailnet — "Connect to VPS" (plan 10.2/10.8).
// The person types a VPS address (user@host) and the core walks the process itself: prove SSH,
// install socat on the VPS, write a user systemd service that forwards one port to this machine's
// tailnet address, and report each step plus a live health probe. Loopback + operator only, like
// computer.ts; every write goes to the named VPS over the person's own SSH key, never another host.
import type { Context, Hono } from "hono";

export type ForwardStatus = {
  configured: boolean;
  host: string | null;          // user@host the forward points at
  localPort: number;            // port forwarded
  localAddr: string | null;     // this machine's tailnet address
  sshOk: boolean;               // does this machine's default key reach the VPS
  socatInstalled: boolean;
  unitActive: boolean;
  listening: boolean;
  health: "ok" | "down" | "unknown" | null;
  steps: { ok: boolean; label: string; detail: string }[];
  busy: boolean;                // a connect is running right now
  progress: { ok: boolean; label: string; detail: string }[]; // steps of the last connect, filled as it runs
  error: string | null;         // why the last connect stopped, null when it did not
};
export type ExposeInput = { host?: unknown; port?: unknown; name?: unknown };

/** Run one remote command over SSH (BatchMode, the person's default key). */
export async function ssh(cmd: (a: string[]) => Promise<{ code: number; out: string; err: string }>, host: string, remote: string): Promise<{ code: number; out: string; err: string }> {
  return cmd(["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=8", "--", host, remote]);
}

/** Build the user systemd unit that forwards localPort -> <tailAddr>:<localPort>. */
export function forwardUnit(name: string, localPort: number, tailAddr: string): string {
  return `[Unit]
Description=${name}
After=network-online.target tailscaled.service

[Service]
Restart=always
RestartSec=3
ExecStart=/usr/bin/socat TCP-LISTEN:${localPort},fork,reuseaddr TCP:${tailAddr}:${localPort}

[Install]
WantedBy=default.target
`;
}

export function validate(host: unknown): { ok: true } | { ok: false; detail: string } {
  if (typeof host !== "string" || !host.trim()) return { ok: false, detail: "host_is_required" };
  const h = host.trim();
  if (h.startsWith("-")) return { ok: false, detail: "host_invalid" }; // never an ssh option
  // one name or IP, optionally user@host; no shell metacharacters
  if (!/^[A-Za-z0-9._:-]+(@[A-Za-z0-9._\-[\]:]+)?$/.test(h)) return { ok: false, detail: "host_invalid" };
  if (/[:;/|&\s]/.test(h.replace(/@[^@]+$/, ""))) return { ok: false, detail: "host_invalid" };
  return { ok: true };
}

// injectable command runner (tests never touch a real network)
export type Runner = { exec(a: string[]): Promise<{ code: number; out: string; err: string }>; calls: string[][] };

export function createExpose(rdr: Runner = defaultRunner, io: { state: () => { host: string | null; port: number } } = { state: () => ({ host: null, port: 4479 }) }) {
  const state = io.state();
  const localPort = state.port;
  const s = { host: state.host, port: localPort, localAddr: null as string | null, busy: false, progress: [] as ForwardStatus["steps"], error: null as string | null };

  const sshRun = (remote: string) => ssh(rdr.exec, s.host ?? "", remote);
  const tailAddrNow = async (): Promise<string | null> => {
    const r = await rdr.exec(["tailscale", "ip", "-4"]).catch(() => ({ code: 1, out: "", err: "" }));
    return r.code === 0 ? r.out.trim().split(/\s+/)[0] || null : null;
  };

  const status = async (): Promise<ForwardStatus> => {
    const steps: ForwardStatus["steps"] = [];
    s.localAddr = await tailAddrNow();
    const tailnet = !!s.localAddr;
    steps.push({ ok: tailnet, label: "Tailscale on this machine", detail: tailnet ? s.localAddr! : "not found (run tailscale up)" });
    let sshOk = false, socat = false, unit = false, listening = false, health: ForwardStatus["health"] = null;
    if (s.host) {
      const ping = await sshRun("true; echo ok").catch(() => ({ code: 1, out: "", err: "" }));
      sshOk = ping.code === 0;
      steps.push({ ok: sshOk, label: `SSH to ${s.host}`, detail: sshOk ? "key accepted" : ping.err.slice(0, 80) || "no reachable key" });
      if (sshOk) {
        const so = await sshRun("command -v socat || echo NONE").catch(() => ({ code: 1, out: "NONE", err: "" }));
        socat = so.out.trim() !== "NONE";
        steps.push({ ok: socat, label: "socat on the VPS", detail: socat ? so.out.trim() : "not installed yet" });
        const ua = await sshRun("systemctl --user is-active caesaros-forward-" + s.port + ".service 2>/dev/null || echo inactive").catch(() => ({ code: 1, out: "inactive", err: "" }));
        unit = ua.out.trim().indexOf("inactive") !== 0;
        steps.push({ ok: unit, label: "forward unit active", detail: unit ? ua.out.trim() : "not active" });
        const ls = await sshRun("ss -ltn 2>/dev/null | grep -c ':" + s.port + "' || true").catch(() => ({ code: 1, out: "0", err: "" }));
        listening = Number(ls.out.trim()) > 0;
        steps.push({ ok: listening, label: `listening on ${s.port}`, detail: listening ? "yes" : "no" });
        if (listening) {
          const h = await sshRun("curl -s -m5 http://127.0.0.1:" + s.port + "/api/health 2>/dev/null | head -c 200 || true").catch(() => ({ code: 1, out: "", err: "" }));
          let body = h.out.trim();
          health = body.includes('"ok":true') ? "ok" : body ? "down" : "unknown";
          steps.push({ ok: health === "ok", label: "health through the forward", detail: health === "ok" ? "ok" : body || "no answer" });
        }
      }
    }
    return { configured: !!s.host, host: s.host, localPort: s.port, localAddr: s.localAddr, sshOk, socatInstalled: socat, unitActive: unit, listening, health, steps, busy: s.busy, progress: s.progress, error: s.error };
  };

  const connect = async (input: ExposeInput): Promise<{ steps: ForwardStatus["steps"] } | { error: string; steps?: ForwardStatus["steps"] }> => {
    const v = validate(input.host);
    if (!v.ok) return { error: v.detail };
    if (s.busy) return { error: "busy" };
    const host = String(input.host).trim();
    const port = typeof input.port === "number" && Number.isInteger(input.port) && input.port > 0 && input.port <= 65535 ? input.port : localPort;
    s.busy = true; s.error = null;
    const steps: ForwardStatus["steps"] = s.progress = [];
    const fail = (error: string) => { s.error = error; return { error, steps }; };
    try {
    s.localAddr = await tailAddrNow();
    if (!s.localAddr) return fail("tailscale_not_available");
    steps.push({ ok: true, label: "Tailscale on this machine", detail: s.localAddr });
    const ping = await ssh(rdr.exec, host, "true; echo ok").catch(() => ({ code: 1, out: "", err: "" }));
    if (ping.code !== 0) { steps.push({ ok: false, label: `SSH to ${host}`, detail: ping.err.slice(0, 80) || "no reachable key" }); return fail("ssh_failed"); }
    steps.push({ ok: true, label: `SSH to ${host}`, detail: "key accepted" });
    // ensure socat is installed (command -v, else apt-get). exit 0 means present after the step.
    const so = await ssh(rdr.exec, host, "command -v socat >/dev/null 2>&1 && echo present || sudo apt-get install -y socat >/dev/null 2>&1 && echo installed || echo still-missing").catch(() => ({ code: 1, out: "still-missing", err: "" }));
    const first = `${so.out}`.trim().split(/\s+/)[0];
    const socatOk = first === "present" || first === "installed";
    steps.push({ ok: socatOk, label: "socat on the VPS", detail: socatOk ? first : "not available after install attempt" });
    if (!socatOk) return fail("socat_failed");
    const unit = forwardUnit("caesaros-forward-" + port, port, s.localAddr);
    const esc = (t: string) => t.replace(/\\/g, "\\\\").replace(/'/g, "'\\''");
    const write = await ssh(rdr.exec, host,
      `mkdir -p ~/.config/systemd/user && cat > ~/.config/systemd/user/caesaros-forward-${port}.service <<'EOF'\n${esc(unit)}\nEOF\nsystemctl --user daemon-reload && systemctl --user enable --now caesaros-forward-${port}.service >/dev/null 2>&1 && echo started || echo start_failed`);
    const started = `${write.out}`.trim().indexOf("start_failed") !== 0;
    steps.push({ ok: started, label: "systemd forward unit", detail: started ? "started" : (write.err || write.out).slice(0, 100) });
    if (!started) return fail("unit_failed");
    s.host = host; s.port = port;
    return { steps };
    } finally { s.busy = false; }
  };

  const disconnect = async (): Promise<{ ok: boolean; detail?: string }> => {
    if (!s.host) return { ok: true };
    const r = await ssh(rdr.exec, s.host, `systemctl --user disable --now caesaros-forward-${s.port}.service 2>/dev/null; rm -f ~/.config/systemd/user/caesaros-forward-${s.port}.service 2>/dev/null; systemctl --user daemon-reload 2>/dev/null; true`).catch(() => ({ code: 1, out: "", err: "" }));
    s.host = null;
    return { ok: r.code === 0 || r.code === undefined, detail: r.err.slice(0, 100) || undefined };
  };

  return { status, connect, disconnect, state: s };
}

const fromLoopback = (c: Context) => {
  const ip = (c.env as { server?: { requestIP?: (r: Request) => { address: string } | null } } | undefined)?.server?.requestIP?.(c.req.raw)?.address;
  return !ip || ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
};

const defaultRunner: Runner = {
  calls: [],
  exec: async (a) => {
    const p = Bun.spawn(a, { stdout: "pipe", stderr: "pipe", env: { ...process.env } });
    const [out, err] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
    return { code: await p.exited, out, err };
  },
};

export function exposeApi(app: Hono, isOperator: (c: Context) => boolean, expose: ReturnType<typeof createExpose> = createExpose(defaultRunner)): void {
  const gate = (c: Context) => fromLoopback(c) ? isOperator(c) ? null : c.json({ error: "operator_only" }, 403) : c.json({ error: "loopback_only" }, 403);
  const wrap = (fn: (c: Context) => Promise<Response>) => async (c: Context) => { const g = gate(c); if (g) return g; try { return await fn(c); } catch (e) { return c.json({ error: (e as Error).message }, 500); } };
  app.get("/api/expose", wrap(async (_c) => _c.json(await expose.status())));
  app.post("/api/expose", wrap(async (c) => { const b = await c.req.json().catch(() => ({} as Record<string, unknown>)); const r = await expose.connect(b); return "error" in r ? c.json(r, 400) : c.json(r, 202); }));
  app.delete("/api/expose", wrap(async (c) => c.json(await expose.disconnect())));
}
