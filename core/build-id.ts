// The id of what the core serves, used to name the service worker cache. It covers the classic shell's index and the name,
// size and modification time of every Atrium script, style and page, so changing any of them makes clients drop their stale copy.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export function buildIdOf(webDir: string, atriumDir: string): string {
  try {
    const h = new Bun.CryptoHasher("sha1");
    try { h.update(readFileSync(join(webDir, "index.html"))); } catch { /* the classic build may be absent */ }
    for (const f of readdirSync(atriumDir).filter((n) => /\.(js|css|html|webmanifest)$/.test(n)).sort()) { const st = statSync(join(atriumDir, f)); h.update(`${f}:${st.size}:${Math.round(st.mtimeMs)};`); }
    return h.digest("hex").slice(0, 12);
  } catch { return "dev"; }
}
