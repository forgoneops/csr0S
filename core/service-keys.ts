// API keys for outside services (Jev, Fish Audio, YouTube, ...), one file per service in data/keys, mode 600. Never logged, never returned by an API: routes may only say "set or not".
// The YouTube channel ID is stored here too: the operator enters both in Settings, and the Business Reach connector reads them server-side.
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const SERVICES = ["jev", "fish", "youtube", "youtube_channel"] as const;
export type Service = (typeof SERVICES)[number];
const dir = (root: string) => join(root, "keys");
const file = (root: string, s: Service) => { if (!SERVICES.includes(s)) throw new Error(`unknown service ${s}`); return join(dir(root), `${s}.key`); };

export const hasKey = (root: string, s: Service) => existsSync(file(root, s));
export const getKey = (root: string, s: Service): string | null => { try { return readFileSync(file(root, s), "utf8").trim() || null; } catch { return null; } };
export function saveKey(root: string, s: Service, key: string) {
  const k = key.trim();
  if (k.length < 8 || /\s/.test(k)) throw new Error("that does not look like an API key");
  mkdirSync(dir(root), { recursive: true, mode: 0o700 });
  writeFileSync(file(root, s), k + "\n", { mode: 0o600 }); chmodSync(file(root, s), 0o600);
}
export const removeKey = (root: string, s: Service) => rmSync(file(root, s), { force: true });

// Oh My Hermes reads Jev's key from TYPESAFE_API_KEY in each Hermes profile's .env, so a key set in Settings is mirrored there (and removed with it).
// Only that one variable is touched; every other line of the file stays as it is. Never throws: a missing profile must not block saving the key.
import { homedir } from "node:os";
import { readdirSync } from "node:fs";
const ENV_VAR: Partial<Record<Service, string>> = { jev: "TYPESAFE_API_KEY" };
export function syncHermesEnv(s: Service, key: string | null, hermes = process.env.HERMES_HOME ?? join(homedir(), ".hermes")): string[] {
  const v = ENV_VAR[s]; if (!v) return [];
  const dirs = [hermes, ...(existsSync(join(hermes, "profiles")) ? readdirSync(join(hermes, "profiles")).filter((p) => !p.startsWith(".") && existsSync(join(hermes, "profiles", p, "config.yaml"))).map((p) => join(hermes, "profiles", p)) : [])], done: string[] = [];
  for (const d of dirs) {
    const f = join(d, ".env"); if (!existsSync(f) && !key) continue;
    try {
      const keep = (existsSync(f) ? readFileSync(f, "utf8") : "").split("\n").filter((l) => !new RegExp(`^\\s*(export\\s+)?${v}\\s*=`).test(l));
      while (keep.length && keep[keep.length - 1] === "") keep.pop();
      writeFileSync(f, [...keep, ...(key ? [`${v}=${key}`] : [])].join("\n") + "\n", { mode: 0o600 }); chmodSync(f, 0o600); done.push(d);
    } catch { /* skip this profile */ }
  }
  return done;
}
