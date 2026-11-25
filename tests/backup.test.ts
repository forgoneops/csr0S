import { expect, test } from "bun:test";
import { Hono } from "hono";
import { Database } from "bun:sqlite";
import { join } from "node:path";
import { DATA } from "../core/db";
import { backupApi, createBackup, listBackups, previewBackupFile } from "../core/backup";

test("a backup is a readable SQLite copy that appears in the list and can be deleted", async () => {
  const name = createBackup(new Date(2026, 10, 22, 12, 0, 0));
  expect(name).toBe("caesaros-20261122-120000.db");
  expect(listBackups().some((b) => b.name === name)).toBe(true);
  const copy = new Database(join(DATA, "backups", name), { readonly: true });
  expect(copy.query("SELECT name FROM sqlite_master WHERE name = 'kv'").all().length).toBe(1);
  copy.close();
  const app = new Hono(); backupApi(app, () => true);
  expect((await app.request(`/api/backup/${name}`, { method: "DELETE" })).status).toBe(200);
  expect(listBackups().some((b) => b.name === name)).toBe(false);
});
test("non-operators are refused and names cannot escape the folder", async () => {
  const app = new Hono(); backupApi(app, () => false);
  expect((await app.request("/api/backup")).status).toBe(403);
  const ok = new Hono(); backupApi(ok, () => true);
  expect((await ok.request("/api/backup/..%2F..%2Fetc%2Fpasswd")).status).toBe(404);
});

test("restore: a real backup previews ok and stays pending, junk is refused, cancel removes it", async () => {
  const name = createBackup(new Date(2026, 10, 22, 13, 0, 0));
  const file = join(DATA, "backups", name);
  expect(previewBackupFile(file)).toMatchObject({ ok: true });
  const app = new Hono(); backupApi(app, () => true);
  const bad = await app.request("/api/backup/restore", { method: "POST", body: "not a database" });
  expect(bad.status).toBe(400);
  const good = await app.request("/api/backup/restore", { method: "POST", body: Bun.file(file) });
  expect(good.status).toBe(200);
  expect(await (await app.request("/api/backup/restore")).json()).toEqual({ pending: true });
  await app.request("/api/backup/restore", { method: "DELETE" });
  expect(await (await app.request("/api/backup/restore")).json()).toEqual({ pending: false });
  await app.request(`/api/backup/${name}`, { method: "DELETE" });
});

test("a pending restore is applied at startup and the old database is kept in backups", async () => {
  const { mkdtempSync, readdirSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const dir = mkdtempSync(join(tmpdir(), "caesaros-restore-"));
  const mk = (f: string, v: string) => { const d = new Database(join(dir, f), { create: true }); d.exec("CREATE TABLE kv (ns TEXT, key TEXT, value TEXT, PRIMARY KEY (ns, key))"); d.query("INSERT INTO kv VALUES ('t','k',?)").run(v); d.close(); };
  mk("caesaros.db", "old"); mk("restore-pending.db", "new");
  const p = Bun.spawnSync(["bun", "-e", 'import { db } from "./core/db"; console.log((db.query("SELECT value FROM kv WHERE ns=\'t\'").get() as {value:string}).value)'], { env: { ...process.env, CAESAROS_DATA: dir }, cwd: join(import.meta.dir, "..") });
  expect(p.stdout.toString().trim()).toBe("new");
  expect(readdirSync(join(dir, "backups")).some((n) => n.startsWith("caesaros-pre-restore-"))).toBe(true);
});

test("two backups in the same second both succeed (audit defect 5)", () => {
  const when = new Date(2026, 10, 22, 14, 0, 0);
  const a = createBackup(when), b = createBackup(when);
  expect(a).not.toBe(b); expect(b).toMatch(/-2\.db$/);
  expect(listBackups().filter((x) => x.name === a || x.name === b).length).toBe(2);
});
