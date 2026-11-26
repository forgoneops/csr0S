// Studio rules: Social lint and lane gate, Reels approval and QC gate, Offer Board layout. Pure logic, no DOM.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const L: any = new Function(readFileSync(join(import.meta.dir, "..", "web", "atrium", "studio-logic.js"), "utf8").replace(/if \(typeof module[^\n]*/, "") + "; return STL;")();

describe("social", () => {
  test("lint finds dashes, secrets, addresses, paths, length, banned phrases", () => {
    expect(L.lint("A clean line.")).toEqual([]);
    expect(L.lint("one — two").length).toBe(1);
    expect(L.lint("one — two", { dash: true })).toEqual([]);
    expect(L.lint("password: hunter2hunter2").length).toBe(1);
    expect(L.lint("see " + ["192", "168", "1", "4"].join(".")).length).toBe(1);
    expect(L.lint(["", "home", "someone", "x"].join("/")).length).toBe(1);
    expect(L.lint("x".repeat(30), { max: 10 }).length).toBe(1);
    expect(L.lint("Game-changer!", { banned: "game-changer" }).length).toBe(1);
  });
  test("a draft with findings cannot be approved, a clean one can; no lane after Approved", () => {
    expect(L.socialMove({ lane: "Drafts", text: "a — b" }, 1).ok).toBe(false);
    expect(L.socialMove({ lane: "Drafts", text: "fine" }, 1)).toEqual({ ok: true, lane: "Approved" });
    expect(L.socialMove({ lane: "Approved", text: "fine" }, 1).ok).toBe(false);
    expect(L.socialMove({ lane: "Signals", text: "" }, -1).ok).toBe(false);
  });
});

describe("reels", () => {
  const good = { w: 1080, h: 1920, dur: 30, audio: true };
  test("qc checks ratio, size, sound, length", () => {
    expect(L.qc(good, 30).ok).toBe(true);
    expect(L.qc({ ...good, w: 1920, h: 1080 }, 30).ok).toBe(false);
    expect(L.qc({ ...good, audio: false }, 30).ok).toBe(false);
    expect(L.qc({ ...good, dur: 33 }, 30).ok).toBe(false);
  });
  test("a stage needs your approval before the next opens; Review needs a passing QC", () => {
    const r: any = { stage: "Direction", ok: {}, sec: 30 };
    expect(L.reelGate(r).ok).toBe(false);
    r.ok.Direction = true; expect(L.reelGate(r)).toEqual({ ok: true, stage: "Script" });
    r.stage = "Review"; r.ok.Review = true; expect(L.reelGate(r).ok).toBe(false);
    r.qc = { ...good, h: 1000 }; expect(L.reelGate(r).ok).toBe(false);
    r.qc = good; expect(L.reelGate(r).stage).toBe("Delivery");
  });
  test("delivery needs every stage approved and a passing QC", () => {
    const r: any = { stage: "Delivery", sec: 30, qc: good, ok: { Direction: 1, Script: 1, Materials: 1, Takes: 1, Review: 1 } };
    expect(L.reelDeliver(r).ok).toBe(false);
    r.ok.Delivery = 1; expect(L.reelDeliver(r).ok).toBe(true);
    delete r.ok.Takes; expect(L.reelDeliver(r).ok).toBe(false);
  });
});

describe("offer boards", () => {
  test("photos and panel sit inside the margin and never overlap", () => {
    for (const name of L.LAYOUTS) for (let n = 0; n <= 12; n++) {
      const { photos, panel } = L.layout(name, n, 1080, 1350), all = [...photos, panel];
      expect(photos.length).toBe(n);
      for (const r of all) { expect(r.x).toBeGreaterThanOrEqual(56); expect(r.y).toBeGreaterThanOrEqual(56); expect(r.x + r.w).toBeLessThanOrEqual(1024); expect(r.y + r.h).toBeLessThanOrEqual(1294); }
      for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) { const a = all[i], b = all[j]; expect(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h).toBe(false); }
    }
  });
  test("cover fills the rect without stretching; files are checked", () => {
    const c = L.cover(2000, 1000, { w: 100, h: 100 });
    expect(c.sw / c.sh).toBeCloseTo(1); expect(c.sh).toBe(1000);
    expect(L.okFile({ type: "image/gif", size: 1 })).not.toBe("");
    expect(L.okFile({ type: "image/png", size: 30e6 })).not.toBe("");
    expect(L.okFile({ type: "image/png", size: 1e6 })).toBe("");
  });
});
