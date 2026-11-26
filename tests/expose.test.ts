import { expect, test } from "bun:test";
import { createExpose, forwardUnit, validate, type Runner } from "../core/expose";

// A scripted runner: each command maps to a canned reply, so no real SSH/tailscale is touched.
function scripted(responses: Record<string, { code?: number; out?: string; err?: string }>): Runner {
  const calls: string[][] = [];
  return {
    exec: async (a) => {
      calls.push(a);
      const key = a.join(" ");
      for (const [pat, r] of Object.entries(responses)) if (key.includes(pat)) return { code: r.code ?? 0, out: r.out ?? "", err: r.err ?? "" };
      return { code: 1, out: "", err: "unexpected:" + key };
    },
    calls,
  };
}

test("validate accepts one name or user@host and rejects shell metacharacters", () => {
  expect(validate("vps.invalid")).toEqual({ ok: true });
  expect(validate("ubuntu@vps")).toEqual({ ok: true });
  expect(validate("host;rm -rf")).toEqual({ ok: false, detail: "host_invalid" });
  expect(validate("a b")).toEqual({ ok: false, detail: "host_invalid" });
  expect(validate("")).toEqual({ ok: false, detail: "host_is_required" });
});

test("forwardUnit writes a Restart=always socat forward to the given tailnet address", () => {
  const u = forwardUnit("caesaros-forward-4479", 4479, "203.0.113.42");
  expect(u).toContain("Restart=always");
  expect(u).toContain("TCP-LISTEN:4479,fork,reuseaddr TCP:203.0.113.42:4479");
  expect(u).toContain("WantedBy=default.target");
});

test("status reports tailnet absent as not-ok and never dials the VPS without a host", async () => {
  const r = scripted({ "tailscale ip -4": { code: 1, out: "" } });
  const e = createExpose(r);
  const s = await e.status();
  expect(s.sshOk).toBe(false);
  expect(s.configured).toBe(false);
  expect(s.host).toBeNull();
  expect(r.calls.length).toBe(1);          // only the tailscale probe; no ssh without a host
});

test("status with a host probes ssh, socat and the forward unit", async () => {
  const r = scripted({
    "tailscale ip -4": { out: "203.0.113.42\n" },
    "true; echo ok": { out: "ok" },
    "command -v socat": { out: "/usr/bin/socat" },
    "is-active caesaros-forward-4479.service": { out: "active" },
    "grep -c ':4479'": { out: "1" },
    "curl -s -m5": { out: '{"ok":true}' },
  });
  const e = createExpose(r, { state: () => ({ host: "ubuntu@vps", port: 4479 }) });
  const s = await e.status();
  expect(s.sshOk).toBe(true);
  expect(s.socatInstalled).toBe(true);
  expect(s.unitActive).toBe(true);
  expect(s.listening).toBe(true);
  expect(s.health).toBe("ok");
  expect(s.steps.some((x) => x.label.includes("health") && x.ok)).toBe(true);
});

test("connect writes the unit and enables it; then disconnect removes it", async () => {
  const r = scripted({
    "tailscale ip -4": { out: "203.0.113.42\n" },
    "true; echo ok": { out: "ok" },
    "echo installed || echo still-missing": { out: "installed" },
    "systemctl --user daemon-reload && systemctl --user enable --now": { out: "started" },
    "disable --now": { out: "" },
    "rm -f": { out: "" },
  });
  const e = createExpose(r);
  const c = await e.connect({ host: "ubuntu@vps", port: 4479 });
  expect("steps" in c && (c.steps?.length ?? 0)).toBeGreaterThanOrEqual(4);
  expect(r.calls.some((a) => a.join(" ").includes("cat > ~/.config/systemd/user/caesaros-forward-4479.service"))).toBe(true);
  const d = await e.disconnect();
  expect(d.ok).toBe(true);
  expect(r.calls.some((a) => a.join(" ").includes("disable --now caesaros-forward-4479.service"))).toBe(true);
});

test("connect refuses a host that fails SSH", async () => {
  const r = scripted({ "tailscale ip -4": { out: "203.0.113.42\n" }, "true; echo ok": { code: 255, err: "Permission denied" } });
  const e = createExpose(r);
  const c = await e.connect({ host: "ubuntu@vps" });
  expect("error" in c && c.error).toBe("ssh_failed");
});

test("connect surfaces a failed socat install as socat_failed", async () => {
  const r = scripted({
    "tailscale ip -4": { out: "203.0.113.42\n" },
    "true; echo ok": { out: "ok" },
    "echo installed || echo still-missing": { out: "still-missing" },
  });
  const e = createExpose(r);
  const c = await e.connect({ host: "ubuntu@vps" });
  expect("error" in c && c.error).toBe("socat_failed");
});

test("an address that starts with a dash is refused, and ssh gets -- before the host", async () => {
  expect(validate("-Jother")).toEqual({ ok: false, detail: "host_invalid" });
  const r = scripted({ "tailscale ip -4": { out: "203.0.113.42\n" }, "true; echo ok": { code: 255, err: "denied" } });
  await createExpose(r).connect({ host: "ubuntu@vps" });
  const s = r.calls.find((a) => a[0] === "ssh")!;
  expect(s[s.indexOf("--") + 1]).toBe("ubuntu@vps");
});

test("a failed connect keeps its steps and error in status, and a second connect while busy is refused", async () => {
  let release: () => void = () => {};
  const gate = new Promise<void>((res) => { release = res; });
  const r: Runner = { calls: [], exec: async (a) => { if (a[0] === "tailscale") { await gate; return { code: 0, out: "203.0.113.42\n", err: "" }; } return { code: 255, out: "", err: "denied" }; } };
  const e = createExpose(r);
  const first = e.connect({ host: "ubuntu@vps" });
  expect(await e.connect({ host: "ubuntu@vps" })).toEqual({ error: "busy" });
  release();
  const done = await first;
  expect("error" in done && done.error).toBe("ssh_failed");
  const st = await e.status();
  expect(st.busy).toBe(false);
  expect(st.error).toBe("ssh_failed");
  expect(st.progress.map((x) => x.ok)).toEqual([true, false]);
});
