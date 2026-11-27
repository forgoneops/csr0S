// Gate R45, the remove test: with the owner folder absent, type check, the core build and the web build
// all still pass. It copies the tree without owner/ and runs the real commands there, so it cannot pass
// by accident on the full tree.
import { describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const SKIP = new Set(["node_modules", "owner", ".git", "data", "dist", "web/dist"]);

function copyTree(dest: string, from = ROOT) {
  cpSync(from, dest, {
    recursive: true,
    filter: (src) => {
      const rel = src.slice(ROOT.length + 1);
      const first = rel.split("/")[0];
      if (SKIP.has(first)) return false;
      if (rel === "web/dist") return false;
      // The native shell's Rust build tree is generated output (GiB-sized); never copy it.
      if (rel === "src-tauri/target" || rel.startsWith("src-tauri/target/")) return false;
      if (rel.includes("node_modules")) return false;
      return true;
    },
  });
}

function run(cmd: string[], cwd: string) {
  const p = Bun.spawnSync(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
  return { code: p.exitCode, out: new TextDecoder().decode(p.stdout) + new TextDecoder().decode(p.stderr) };
}

describe.skipIf(!!process.env.CAESAROS_SKIP_HEAVY)("core alone (owner removed)", () => {
  test("type check, core build and web build pass without owner/", () => {
    const dir = mkdtempSync(join(tmpdir(), "caesaros-core-alone-"));
    try {
      copyTree(dir);
      expect(existsSync(join(dir, "owner"))).toBe(false);
      symlinkSync(join(ROOT, "node_modules"), join(dir, "node_modules"), "dir");

      const tsc = run([process.execPath, "x", "tsc", "--noEmit", "-p", "."], dir);
      expect(tsc.out.trim()).toBe("");
      expect(tsc.code).toBe(0);

      const core = run([process.execPath, "build", "core/server.ts", "--target=bun", "--outdir", "dist/core-check"], dir);
      expect(core.code).toBe(0);
      expect(existsSync(join(dir, "dist/core-check/server.js"))).toBe(true);

      const web = run([process.execPath, join(ROOT, "node_modules/vite/bin/vite.js"), "build", "web"], dir);
      expect(web.code).toBe(0);
      expect(existsSync(join(dir, "web/dist/index.html"))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 180_000);
});
