// Update check: is there a newer package than the one running? Reads a small JSON feed (latest.json, written next to the package by
// tools/package-linux.sh) from a URL the person configures. There is no default feed in the code: nothing is contacted until one is set,
// and nothing is downloaded until the person asks. Staging verifies the checksum before anything is unpacked; the swap is done by a helper after the app has exited.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Context, Hono } from "hono";

export type Feed = { version: string; file?: string; url?: string; sha256?: string; size?: number; notes?: string };
export type Check = { current: string; latest: string | null; newer: boolean; feed: Feed | null; error?: string };

/** Compare dotted numeric versions (0.1.0 < 0.1.10 < 0.2.0). A part that is not a number counts as 0. */
export function newerThan(a: string, b: string): boolean {
  const pa = a.split(".").map((x) => parseInt(x, 10) || 0), pb = b.split(".").map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const d = (pa[i] ?? 0) - (pb[i] ?? 0); if (d) return d > 0; }
  return false;
}

export async function checkUpdate(feedUrl: string | undefined, current: string, fetchImpl: typeof fetch = fetch): Promise<Check> {
  const none: Check = { current, latest: null, newer: false, feed: null };
  if (!feedUrl) return { ...none, error: "no_feed_configured" };
  let u: URL; try { u = new URL(feedUrl); } catch { return { ...none, error: "feed_url_invalid" }; }
  if (u.protocol !== "https:" && !(u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1"))) return { ...none, error: "feed_must_be_https" };
  try {
    const r = await fetchImpl(u, { signal: AbortSignal.timeout(8000), headers: { accept: "application/json" } });
    if (!r.ok) return { ...none, error: `feed_status_${r.status}` };
    const j = (await r.json()) as Partial<Feed>;
    if (typeof j.version !== "string" || !/^\d+(\.\d+){1,3}$/.test(j.version)) return { ...none, error: "feed_invalid" };
    const feed: Feed = { version: j.version, file: typeof j.file === "string" ? j.file : undefined, url: typeof j.url === "string" ? j.url : undefined, sha256: typeof j.sha256 === "string" && /^[0-9a-f]{64}$/.test(j.sha256) ? j.sha256 : undefined, size: typeof j.size === "number" ? j.size : undefined, notes: typeof j.notes === "string" ? j.notes.slice(0, 2000) : undefined };
    return { current, latest: feed.version, newer: newerThan(feed.version, current), feed };
  } catch { return { ...none, error: "feed_unreachable" }; }
}

const MAX_PACKAGE = 400 * 1024 * 1024;
export type Staged = { ok: true; version: string; dir: string } | { ok: false; error: string; detail?: string };
const run = (argv: string[]) => { const r = Bun.spawnSync(argv, { stdout: "pipe", stderr: "pipe" }); return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() }; };

/** Download the package of `feed`, refuse it unless its SHA-256 (and size) match the feed, check that it only unpacks inside its own folder, then unpack it under <dataDir>/updates/<version>/. */
export async function stageUpdate(feed: Feed, dataDir: string, fetchImpl: typeof fetch = fetch): Promise<Staged> {
  if (!feed.url || !feed.sha256) return { ok: false, error: "feed_has_no_checksum_or_url" };
  let u: URL; try { u = new URL(feed.url); } catch { return { ok: false, error: "package_url_invalid" }; }
  if (u.protocol !== "https:" && !(u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1"))) return { ok: false, error: "package_must_be_https" };
  if (!/^\d+(\.\d+){1,3}$/.test(feed.version)) return { ok: false, error: "version_invalid" };
  let buf: Buffer;
  try {
    const r = await fetchImpl(u, { signal: AbortSignal.timeout(300_000) });
    if (!r.ok) return { ok: false, error: `package_status_${r.status}` };
    const len = Number(r.headers.get("content-length") ?? 0); if (len > MAX_PACKAGE) return { ok: false, error: "package_too_large" };
    buf = Buffer.from(await r.arrayBuffer());
  } catch { return { ok: false, error: "package_unreachable" }; }
  if (buf.length > MAX_PACKAGE) return { ok: false, error: "package_too_large" };
  if (feed.size !== undefined && buf.length !== feed.size) return { ok: false, error: "size_mismatch" };
  if (createHash("sha256").update(buf).digest("hex") !== feed.sha256) return { ok: false, error: "checksum_mismatch" };
  const dir = join(dataDir, "updates", feed.version), pkg = join(dir, "package.tar.gz");
  try { rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true, mode: 0o700 }); writeFileSync(pkg, buf, { mode: 0o600 }); }
  catch (e) { try { rmSync(dir, { recursive: true, force: true }); } catch { /* nothing to clean */ } const code = (e as { code?: string }).code; return { ok: false, error: code === "ENOSPC" || code === "EDQUOT" ? "disk_full" : "write_failed" }; }
  const list = run(["tar", "-tzf", pkg]); if (list.code !== 0) return { ok: false, error: "package_not_a_tarball" };
  const names = list.out.split("\n").filter(Boolean);
  if (!names.length || names.some((n) => n.startsWith("/") || n.split("/").includes("..") || !n.startsWith("caesaros-linux-x64/"))) { rmSync(dir, { recursive: true, force: true }); return { ok: false, error: "package_paths_refused" }; }
  const x = run(["tar", "-xzf", pkg, "-C", dir, "--no-same-owner"]); if (x.code !== 0) { rmSync(dir, { recursive: true, force: true }); return { ok: false, error: "unpack_failed", detail: x.err.trim().slice(0, 200) }; }
  if (!existsSync(join(dir, "caesaros-linux-x64", "install.sh"))) { rmSync(dir, { recursive: true, force: true }); return { ok: false, error: "package_has_no_installer" }; }
  return { ok: true, version: feed.version, dir: join(dir, "caesaros-linux-x64") };
}

/** The staged package, if one is waiting: the newest folder under <dataDir>/updates/ that has an installer. */
export function stagedUpdate(dataDir: string): { version: string; dir: string } | null {
  const root = join(dataDir, "updates"); if (!existsSync(root)) return null;
  const vs = readdirSync(root).filter((v) => existsSync(join(root, v, "caesaros-linux-x64", "install.sh"))).sort((a, b) => (newerThan(a, b) ? -1 : 1));
  return vs[0] ? { version: vs[0], dir: join(root, vs[0], "caesaros-linux-x64") } : null;
}

export type UpdateDeps = { fetchImpl?: typeof fetch; dataDir: string; appDir?: string; parentPid?: number; parentName?: (pid: number) => string; launch?: (argv: string[]) => void; stopParent?: (pid: number) => void };

export function updateApi(app: Hono, isOperator: (c: Context) => boolean, feed: () => string | undefined, current: string, d: UpdateDeps) {
  const gate = (c: Context) => (isOperator(c) ? null : c.json({ error: "operator_only" }, 403));
  const confirmed = async (c: Context) => ((await c.req.json().catch(() => ({}))) as { confirm?: unknown }).confirm === true;
  app.get("/api/update/check", async (c) => gate(c) ?? c.json({ ...(await checkUpdate(feed(), current, d.fetchImpl)), staged: stagedUpdate(d.dataDir)?.version ?? null }));
  // Download and verify. Nothing is installed: the person confirms, then restarts.
  app.post("/api/update/apply", async (c) => {
    const g = gate(c); if (g) return g;
    if (!(await confirmed(c))) return c.json({ error: "confirm_required" }, 400);
    const chk = await checkUpdate(feed(), current, d.fetchImpl);
    if (chk.error || !chk.feed) return c.json({ error: chk.error ?? "no_update" }, 409);
    if (!chk.newer) return c.json({ error: "up_to_date", current }, 409);
    const r = await stageUpdate(chk.feed, d.dataDir, d.fetchImpl);
    return r.ok ? c.json({ staged: r.version }) : c.json({ error: r.error, ...("detail" in r && r.detail ? { detail: r.detail } : {}) }, 502);
  });
  // Hand over to the helper: it waits for the app to exit, backs the app up, installs the staged package and starts it again.
  app.post("/api/update/restart", async (c) => {
    const g = gate(c); if (g) return g;
    if (!(await confirmed(c))) return c.json({ error: "confirm_required" }, 400);
    const st = stagedUpdate(d.dataDir); if (!st) return c.json({ error: "nothing_staged" }, 409);
    const ppid = d.parentPid ?? process.ppid, name = (d.parentName ?? ((p: number) => { try { return require("node:fs").readFileSync(`/proc/${p}/comm`, "utf8").trim(); } catch { return ""; } }))(ppid);
    const appDir = d.appDir ?? dirname(process.execPath), helper = join(appDir, "apply-update.sh");
    if (name !== "caesaros-shell" || !existsSync(helper)) return c.json({ error: "not_running_as_the_installed_app" }, 409);
    (d.launch ?? ((argv) => { Bun.spawn(argv, { stdin: "ignore", stdout: "ignore", stderr: "ignore" }).unref(); }))(["setsid", "-f", helper, String(ppid), st.dir]);
    setTimeout(() => (d.stopParent ?? ((p) => process.kill(p, "SIGTERM")))(ppid), 500);
    return c.json({ restarting: st.version }, 202);
  });
}
