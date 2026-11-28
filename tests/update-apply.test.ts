import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { stageUpdate, stagedUpdate, updateApi } from "../core/update";

const tmp = () => mkdtempSync(join(tmpdir(), "upd-"));
const sh = (argv: string[], cwd?: string, env?: Record<string, string>) => Bun.spawnSync(argv, { cwd, env: { ...process.env, ...env }, stdout: "pipe", stderr: "pipe" });
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

/** A package like the real one: caesaros-linux-x64/install.sh and a marker file. */
function makePackage(marker = "new") {
  const w = tmp(), d = join(w, "caesaros-linux-x64"); mkdirSync(d);
  writeFileSync(join(d, "install.sh"), `#!/usr/bin/env bash\nset -e\nmkdir -p "$CAESAROS_APP_DIR"; echo ${marker} > "$CAESAROS_APP_DIR/version.txt"\n`); chmodSync(join(d, "install.sh"), 0o755);
  sh(["tar", "-czf", join(w, "p.tar.gz"), "-C", w, "caesaros-linux-x64"]);
  return readFileSync(join(w, "p.tar.gz"));
}
const serve = (pkg: Buffer) => (async (u: URL | string) => String(u).endsWith("latest.json") ? new Response(JSON.stringify({ version: "0.2.0", url: "https://x.test/p.tar.gz", sha256: sha(pkg), size: pkg.length })) : new Response(new Uint8Array(pkg))) as unknown as typeof fetch;
const feed = (pkg: Buffer) => ({ version: "0.2.0", url: "https://x.test/p.tar.gz", sha256: sha(pkg), size: pkg.length });

test("a package is staged only when its checksum and size match, and is unpacked inside its own folder", async () => {
  const pkg = makePackage(), data = tmp();
  const ok = await stageUpdate(feed(pkg), data, serve(pkg));
  expect(ok.ok).toBe(true); expect(existsSync(join(data, "updates", "0.2.0", "caesaros-linux-x64", "install.sh"))).toBe(true);
  expect(stagedUpdate(data)?.version).toBe("0.2.0");
  const bad = tmp();
  expect(await stageUpdate({ ...feed(pkg), sha256: "0".repeat(64) }, bad, serve(pkg))).toEqual({ ok: false, error: "checksum_mismatch" });
  expect(await stageUpdate({ ...feed(pkg), size: pkg.length + 1 }, bad, serve(pkg))).toEqual({ ok: false, error: "size_mismatch" });
  expect((await stageUpdate({ version: "0.2.0", url: "https://x.test/p.tar.gz" }, bad, serve(pkg)))).toEqual({ ok: false, error: "feed_has_no_checksum_or_url" });
  expect(existsSync(join(bad, "updates"))).toBe(false);   // nothing was written for a refused package
});

test("a package that tries to unpack outside its folder is refused", async () => {
  const w = tmp(); mkdirSync(join(w, "caesaros-linux-x64")); writeFileSync(join(w, "caesaros-linux-x64", "install.sh"), "x"); writeFileSync(join(w, "evil.txt"), "x");
  sh(["tar", "-czf", join(w, "e.tar.gz"), "-C", w, "caesaros-linux-x64", "evil.txt"]);
  const pkg = readFileSync(join(w, "e.tar.gz")), data = tmp();
  expect(await stageUpdate(feed(pkg), data, serve(pkg))).toEqual({ ok: false, error: "package_paths_refused" });
  expect(existsSync(join(data, "updates", "0.2.0"))).toBe(false);
});

test("apply needs a confirmation and an operator; restart needs a staged package and the installed app as parent", async () => {
  const pkg = makePackage(), data = tmp(), launched: string[][] = [], stopped: number[] = [];
  const mk = (op: boolean, over: Record<string, unknown> = {}) => { const a = new Hono(); updateApi(a, () => op, () => "https://x.test/latest.json", "0.1.0", { fetchImpl: serve(pkg), dataDir: data, appDir: data, parentPid: 4242, parentName: () => "caesaros-shell", launch: (a) => launched.push(a), stopParent: (p) => stopped.push(p), ...over }); return a; };
  const post = (a: Hono, p: string, body: unknown) => a.request(p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  expect((await post(mk(false), "/api/update/apply", { confirm: true })).status).toBe(403);
  expect((await post(mk(true), "/api/update/apply", {})).status).toBe(400);
  expect((await post(mk(true), "/api/update/restart", { confirm: true })).status).toBe(409);        // nothing staged yet
  expect((await post(mk(true), "/api/update/apply", { confirm: true })).status).toBe(200);
  expect((await post(mk(true, { parentName: () => "bash" }), "/api/update/restart", { confirm: true })).status).toBe(409);   // not run by the installed app
  writeFileSync(join(data, "apply-update.sh"), "#!/bin/sh\n");
  const r = await post(mk(true), "/api/update/restart", { confirm: true });
  expect(r.status).toBe(202); expect(launched[0].slice(0, 3)).toEqual(["setsid", "-f", join(data, "apply-update.sh")]); expect(launched[0][3]).toBe("4242");
  await Bun.sleep(700); expect(stopped).toEqual([4242]);
});

test("the helper swaps the app, keeps a backup, and puts the old app back when the installer fails", () => {
  const home = tmp(), app = join(home, "app"), log = join(home, "u.log"); mkdirSync(app); writeFileSync(join(app, "version.txt"), "old");
  const good = tmp(); mkdirSync(join(good, "p")); writeFileSync(join(good, "p", "install.sh"), `#!/usr/bin/env bash\nset -e\nrm -rf "$CAESAROS_APP_DIR"; mkdir -p "$CAESAROS_APP_DIR"; echo new > "$CAESAROS_APP_DIR/version.txt"\n`);
  const env = { CAESAROS_APP_DIR: app, CAESAROS_UPDATE_LOG: log, CAESAROS_NO_START: "1", HOME: home };
  const r = sh(["bash", join(import.meta.dir, "..", "tools", "apply-update.sh"), "999999", join(good, "p")], undefined, env);
  expect(r.exitCode).toBe(0); expect(readFileSync(join(app, "version.txt"), "utf8").trim()).toBe("new");
  expect(Bun.spawnSync(["bash", "-c", `ls -d ${app}.bak-* | wc -l`]).stdout.toString().trim()).toBe("1");
  const bad = tmp(); mkdirSync(join(bad, "p")); writeFileSync(join(bad, "p", "install.sh"), `#!/usr/bin/env bash\nrm -rf "$CAESAROS_APP_DIR"/*\nexit 1\n`);
  sh(["bash", join(import.meta.dir, "..", "tools", "apply-update.sh"), "999999", join(bad, "p")], undefined, env);
  expect(readFileSync(join(app, "version.txt"), "utf8").trim()).toBe("new");   // restored from the backup taken just before
  expect(readFileSync(log, "utf8")).toContain("installer failed, restoring");
});

test("a disk or permission problem while saving gives an answer, not a crash", async () => {
  const pkg = makePackage(), w = tmp(), notADir = join(w, "file"); writeFileSync(notADir, "x");
  const r = await stageUpdate(feed(pkg), notADir, serve(pkg));
  expect(r.ok).toBe(false); expect(["write_failed", "disk_full"]).toContain((r as { error: string }).error);
});
