import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseDf } from "../core/admin";
import { change, cleanLine, readRoster, writeRoster } from "../core/roster";

test("rename, role, retire and restore change only the roster, and an empty name resets", () => {
  let r = change({ names: {}, roles: {}, retired: [] }, "varro", { name: "  Varro <b>the Keeper</b> ", role: "Keeper" });
  expect(r.names.varro).toBe("Varro b the Keeper /b"); expect(r.roles.varro).toBe("Keeper");
  r = change(r, "varro", { retire: true }); expect(r.retired).toEqual(["varro"]);
  r = change(change(r, "varro", { retire: true }), "varro", { retire: false }); expect(r.retired).toEqual([]);
  expect(change(r, "varro", { name: "" }).names.varro).toBeUndefined();
});
test("the roster file round trips and ignores junk", () => {
  process.env.CAESAROS_DATA = mkdtempSync(join(tmpdir(), "roster-"));
  expect(readRoster()).toEqual({ names: {}, roles: {}, retired: [] });
  writeRoster({ names: { annona: "Annona" }, roles: {}, retired: ["balbus"] });
  expect(readRoster().retired).toEqual(["balbus"]);
  expect(cleanLine("a\u0000b".repeat(40), 10).length).toBeLessThanOrEqual(10);
});
test("df output becomes real disks only, one per mount", () => {
  const t = `Filesystem Type 1024-blocks Used Available Capacity Mounted on
/dev/nvme0n1p2 ext4 104857600 52428800 52428800 50% /
tmpfs tmpfs 8000000 100 7999900 1% /run
/dev/nvme0n1p1 vfat 1048576 262144 786432 25% /boot
/dev/nvme0n1p2 ext4 104857600 52428800 52428800 50% /`;
  expect(parseDf(t)).toEqual([{ mount: "/", fs: "ext4", totalGb: 100, usedGb: 50, pct: 50 }, { mount: "/boot", fs: "vfat", totalGb: 1, usedGb: 0.3, pct: 25 }]);
});

test("the Lair puts Caesar at the top of the ring and everyone else evenly round it, all inside the stage", () => {
  const src = readFileSync(join(import.meta.dir, "..", "web", "atrium", "lair.js"), "utf8");
  const win: any = {};
  const doc: any = { querySelectorAll: () => [], addEventListener() {}, body: {}, documentElement: {} };
  new Function("window", "document", "register", "render", "MutationObserver", "requestAnimationFrame", "setInterval", "localStorage", src)(win, doc, () => {}, () => {}, class { observe() {} }, () => 0, () => 0, { getItem: () => null, setItem() {} });
  const p = win.xLairPlace(8, "lair", 0);
  expect(p[0]).toEqual({ x: 50, y: 30 });                       // the lead sits at the top
  expect(new Set(p.map((q: any) => `${q.x},${q.y}`)).size).toBe(8);   // nobody shares a spot
  for (const q of p) { expect(q.x).toBeGreaterThan(5); expect(q.x).toBeLessThan(95); expect(q.y).toBeGreaterThan(10); expect(q.y).toBeLessThan(95); }
  expect(win.xLairPlace(3, "table", 2)[2]).toEqual({ x: 50, y: 25 });   // the lead is whoever index says
  expect(win.xKeeper("board", "T", "x")).toContain("Balbus");
  expect(win.xKeeper("board", "<i>", "")).toContain("&lt;i&gt;");
});
