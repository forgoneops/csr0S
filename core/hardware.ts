// Machine profile as a pure function plus a read-only reader, and the three-tier model
// advice (M1). Reads RAM, CPU, free disk and the GPU vendor from /sys; runs nothing, sends nothing.
// The catalog below is our own short list: sizes are approximate Q4 downloads, checked against nothing live
// (shortcut: static list, replace with the remote catalog of M5 when it exists).
import { cpus, platform, totalmem } from "node:os";
import { readFileSync, readdirSync, statfsSync } from "node:fs";

export type Machine = { ramGb: number; cores: number; freeDiskGb: number; gpu: "nvidia" | "amd" | "intel" | "none" | "unknown"; os: string };
export type Tier = "quick" | "balanced" | "max";
export type Advice = { tier: Tier; model: string; sizeGb: number; why: string };

const GB = 1024 ** 3;
const VENDOR: Record<string, Machine["gpu"]> = { "0x10de": "nvidia", "0x1002": "amd", "0x8086": "intel" };

/** The GPU vendor from the first DRM card; "unknown" when /sys cannot say (not Linux, container). */
function gpuVendor(): Machine["gpu"] {
  try {
    for (const c of readdirSync("/sys/class/drm").filter((n) => /^card\d+$/.test(n))) {
      const v = readFileSync(`/sys/class/drm/${c}/device/vendor`, "utf8").trim().toLowerCase();
      if (VENDOR[v]) return VENDOR[v]!;
    }
    return "none";
  } catch { return "unknown"; }
}

export function readMachine(dataDir: string): Machine {
  let free = 0;
  try { const s = statfsSync(dataDir); free = (s.bavail * s.bsize) / GB; } catch { /* unreadable: 0 means "do not recommend a download" */ }
  return { ramGb: Math.round((totalmem() / GB) * 10) / 10, cores: cpus().length, freeDiskGb: Math.round(free * 10) / 10, gpu: gpuVendor(), os: platform() };
}

/** Our own short list, small to large. Sizes in GB, approximate. */
export const CATALOG = [
  { model: "llama3.2:1b", sizeGb: 1.3, minRamGb: 4 },
  { model: "llama3.2:3b", sizeGb: 2.0, minRamGb: 6 },
  { model: "llama3.1:8b", sizeGb: 4.9, minRamGb: 12 },
  { model: "qwen2.5:14b", sizeGb: 9.0, minRamGb: 20 },
  { model: "qwen2.5:32b", sizeGb: 20, minRamGb: 40 },
] as const;

/** Pure: Quick is the smallest that fits, Balanced the middle fit, Max the largest that fits RAM with 2x its size free on disk. */
export function advise(m: Machine): Advice[] {
  const fits = CATALOG.filter((c) => m.ramGb >= c.minRamGb && (m.freeDiskGb === 0 || m.freeDiskGb >= c.sizeGb * 2));
  if (!fits.length) return [];
  const pick = (i: number, tier: Tier, why: string): Advice => ({ tier, model: fits[i]!.model, sizeGb: fits[i]!.sizeGb, why });
  const out = [pick(0, "quick", "Smallest that runs well on this machine")];
  if (fits.length > 2) out.push(pick(Math.floor((fits.length - 1) / 2), "balanced", "A good trade between quality and speed"));
  if (fits.length > 1) out.push(pick(fits.length - 1, "max", "Best quality this memory and disk can hold"));
  return out;
}
