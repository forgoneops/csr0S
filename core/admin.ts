// The Praetorium's admin tab: the disks and the machine, read only. Sizes, load and uptime; no file names, no users.
import type { Context, Hono } from "hono";
import { cpus, freemem, loadavg, platform, totalmem, uptime } from "node:os";

export type Disk = { mount: string; fs: string; totalGb: number; usedGb: number; pct: number };
const REAL_FS = /^(ext[234]|xfs|btrfs|f2fs|zfs|ntfs|vfat|exfat|apfs|hfs|overlay)$/;

/** `df -kPT` output as disks: real file systems only (no tmpfs, devtmpfs, squashfs), one row per mount. */
export function parseDf(text: string): Disk[] {
  const out: Disk[] = [], seen = new Set<string>();   // one row per device: btrfs subvolumes mounted twice are one disk
  for (const line of text.split("\n").slice(1)) {
    const f = line.trim().split(/\s+/);
    if (f.length < 7) continue;
    const [dev, type, total, used] = [f[0], f[1], Number(f[2]), Number(f[3])], mount = f.slice(6).join(" ");
    if (!REAL_FS.test(type) || !(total > 0) || seen.has(dev) || out.some((d) => d.mount === mount)) continue;
    seen.add(dev);
    out.push({ mount, fs: type, totalGb: Math.round(total / 1048576 * 10) / 10, usedGb: Math.round(used / 1048576 * 10) / 10, pct: Math.min(100, Math.round(used / total * 100)) });
  }
  return out;
}

async function disks(): Promise<Disk[]> {
  try {
    const p = Bun.spawn(["df", "-kPT"], { stdin: "ignore", stdout: "pipe", stderr: "ignore" });
    const t = setTimeout(() => p.kill(), 5000); const text = await new Response(p.stdout as ReadableStream).text(); clearTimeout(t);
    return parseDf(text);
  } catch { return []; }
}

export async function adminState() {
  const GB = 1024 ** 3, [l1, l5, l15] = loadavg();
  return { disks: await disks(), machine: { os: platform(), cores: cpus().length, ramGb: Math.round(totalmem() / GB * 10) / 10, freeRamGb: Math.round(freemem() / GB * 10) / 10, load: [l1, l5, l15].map((x) => Math.round(x * 100) / 100), uptimeH: Math.round(uptime() / 360) / 10 } };
}

export const adminApi = (app: Hono, isOperator: (c: Context) => boolean) => app.get("/api/admin", async (c) => (isOperator(c) ? c.json(await adminState()) : c.json({ error: "operator_only" }, 403)));
