import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { CLEARABLE, clearCache, sizeOf, storageApi, storageReport } from "../core/storage";

let root: string, data: string;
const put = (rel: string, n: number, base = data) => { const f = join(base, rel); mkdirSync(join(f, ".."), { recursive: true }); writeFileSync(f, "x".repeat(n)); return f; };
// every kind of thing a person owns in the data folder
const USER = ["caesaros.db", "caesaros.db-wal", "notes/a.md", "library/keep.pdf", "images/p.png", "mail/mail.db", "backups/b.db", "modules/m/state", "terminal/s", "locales/pl.json", "computer-token"];

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "caesaros-storage-"));
  data = join(root, "data");
  for (const f of USER) put(f, 100);
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const intact = () => { for (const f of USER) expect(readFileSync(join(data, f), "utf8")).toHaveLength(100); };
const ask = (app: Hono, body: string) => app.request("/api/storage/clear", { method: "POST", headers: { "content-type": "application/json" }, body });

describe("storage report", () => {
  test("every byte is counted once: previews as cache, not as library", async () => {
    put("library/cache/x-1.png", 500);
    const r = await storageReport(data);
    const by = Object.fromEntries(r.areas.map((a) => [a.id, a.bytes]));
    expect(r.caches[0]!.bytes).toBe(500);
    expect(by.database).toBe(200);
    expect(by.other).toBeGreaterThanOrEqual(200);   // locales/ (with its folder entry) and the token file
    expect(by.library).toBeLessThan(500 + 100);
  });
  test("a link is not followed when sizes are added up", async () => {
    put("big", 100_000, join(root, "outside"));
    symlinkSync(join(root, "outside"), join(data, "notes", "link"));
    expect(await sizeOf(join(data, "notes"))).toBeLessThan(50_000);
  });
});

describe("clear", () => {
  test("the allowed list is exactly the library previews", () => {
    expect(Object.keys(CLEARABLE)).toEqual(["library-previews"]);
  });
  test("it empties the cache, keeps the folder, and leaves user data alone", async () => {
    put("library/cache/x.pdf", 300); put("library/cache/out-x/deep.pdf", 200);
    const r = await clearCache(data, "library-previews");
    expect("freed" in r && r.freed).toBeGreaterThanOrEqual(500);
    expect(existsSync(join(data, "library", "cache"))).toBe(true);
    expect((await storageReport(data)).caches[0]!.bytes).toBe(0);
    intact();
  });
  test("names, paths and prototype keys that are not on the list are refused", async () => {
    put("library/cache/x.pdf", 300);
    for (const id of ["notes", "library", "database", "backups", "..", "../notes", "library/cache", data, "__proto__", "constructor", "toString", "", null, undefined, 1, ["library-previews"], { path: "notes" }])
      expect(await clearCache(data, id)).toEqual({ error: "not_clearable" });
    intact();
    expect(existsSync(join(data, "library", "cache", "x.pdf"))).toBe(true);
  });
  test("a cache folder that is a link is not touched", async () => {
    symlinkSync(join(data, "notes"), join(data, "library", "cache"));
    expect(await clearCache(data, "library-previews")).toEqual({ freed: 0 });
    intact();
  });
  test("a library folder that is a link is not touched", async () => {
    const out = put("cache/mine", 100, join(root, "outside"));
    rmSync(join(data, "library"), { recursive: true });
    symlinkSync(join(root, "outside"), join(data, "library"));
    expect(await clearCache(data, "library-previews")).toEqual({ freed: 0 });
    expect(existsSync(out)).toBe(true);
  });
  test("a link inside the cache is removed, its target stays", async () => {
    mkdirSync(join(data, "library", "cache"));
    symlinkSync(join(data, "notes"), join(data, "library", "cache", "to-notes"));
    await clearCache(data, "library-previews");
    expect(existsSync(join(data, "library", "cache", "to-notes"))).toBe(false);
    intact();
  });
});

describe("routes", () => {
  const make = (operator = true, busy = false) => { const app = new Hono(); storageApi(app, () => operator, { dataDir: data, busy: () => busy, engines: () => [{ name: "Engine", dir: join(root, "nothing") }] }); return app; };
  test("only the operator reads or clears", async () => {
    put("library/cache/x.pdf", 300);
    const app = make(false);
    expect((await app.request("/api/storage")).status).toBe(403);
    expect((await ask(app, '{"id":"library-previews"}')).status).toBe(403);
    expect(existsSync(join(data, "library", "cache", "x.pdf"))).toBe(true);
  });
  test("the report carries no path, and an absent engine is not listed", async () => {
    const res = await make().request("/api/storage"), text = await res.text();
    expect(res.status).toBe(200);
    expect(text).not.toContain(root);
    expect(JSON.parse(text).engines).toEqual([]);
  });
  test("a path from the client is ignored or refused", async () => {
    const app = make();
    for (const body of ['{"id":"notes"}', '{"path":"notes"}', "not json", "null", "{}"]) expect((await ask(app, body)).status).toBe(400);
    intact();
  });
  test("it waits while a preview is being made", async () => {
    put("library/cache/x.pdf", 300);
    expect((await ask(make(true, true), '{"id":"library-previews"}')).status).toBe(409);
    expect(existsSync(join(data, "library", "cache", "x.pdf"))).toBe(true);
  });
});
