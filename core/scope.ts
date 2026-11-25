// Where an engine's model runs: on this machine or your own network ("local") or at a provider ("cloud"). The switch "Local only"
// (plan 7.8) keeps every turn on local engines. An engine says it itself; an unknown one counts as cloud, never the other way round.
// A Hermes profile is local when its own config points at a local provider or a private address (the same rule the old header chip used).
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { EngineAdapter } from "./engines/types";

export type Scope = "local" | "cloud";
const LOCAL_PROVIDERS = /^(ollama|lmstudio|lm-studio|llama\.?cpp|llamacpp|vllm|local)$/i;

/** True for this machine and private home-network addresses; a tailnet or public host is not local. A NAME never counts, only
 *  "localhost" and an IP literal: "10.example.com" or "192.168.evil.org" are ordinary public names. */
export const isLocalUrl = (u: string): boolean => {
  let h: string; try { h = new URL(u).hostname.toLowerCase(); } catch { return false; }
  h = h.replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h === "::1") return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h); if (!m) return false;
  const [a, b, c, d] = m.slice(1).map(Number); if ([a, b, c, d].some((n) => n > 255)) return false;
  return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
};

/** The first-level `model:` block of a YAML config as flat strings (enough for provider and base_url). */
export function modelBlock(yaml: string): Record<string, string> {
  const out: Record<string, string> = {}; let inside = false;
  for (const line of yaml.split("\n")) {
    if (/^model:\s*$/.test(line)) { inside = true; continue; }
    if (inside) {
      if (/^\S/.test(line)) break;
      const m = line.match(/^\s+([\w-]+):\s*(.*?)\s*$/); if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
    }
  }
  return out;
}

export function hermesScope(profile: string, home = process.env.HERMES_HOME ?? join(homedir(), ".hermes")): Scope {
  const f = profile && profile !== "default" ? join(home, "profiles", profile, "config.yaml") : join(home, "config.yaml");
  let yaml = ""; try { yaml = existsSync(f) ? readFileSync(f, "utf8") : ""; } catch { /* unreadable counts as cloud */ }
  const b = modelBlock(yaml);
  return LOCAL_PROVIDERS.test(b.provider ?? "") || (!!b.base_url && isLocalUrl(b.base_url)) ? "local" : "cloud";
}

export const scopeOf = (e: EngineAdapter): Scope => e.scope?.() ?? "cloud";
