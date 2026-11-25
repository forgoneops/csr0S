// Plan 7.10 review: the person reads the automatic translations next to the English, edits one, approves one, or takes the English back.
import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { createI18n, i18nApi } from "../core/i18n";

const tmp = () => mkdtempSync(join(tmpdir(), "i18nr-"));
const mk = () => { const seedDir = tmp(), dir = tmp(); writeFileSync(join(seedDir, "pl.json"), JSON.stringify({ Open: "Otwórz" })); const i = createI18n({ dir, seedDir }); writeFileSync(join(dir, "pl.json"), JSON.stringify({ Cancel: "Anuluj", "{n} notes": "{n} notatek", Sync: "Sync" })); return i; };

describe("review store", () => {
  test("lists the person's own automatic translations, automatic first, with their state", () => {
    const i = mk(); i.approve("pl", "Cancel");
    expect(i.review("pl")).toEqual([
      { en: "{n} notes", pl: "{n} notatek", state: "auto" }, { en: "Sync", pl: "Sync", state: "english" }, { en: "Cancel", pl: "Anuluj", state: "approved" },
    ]);
  });
  test("an edit replaces the text and approves it; a lost placeholder, an empty text and an unknown string are refused", () => {
    const i = mk();
    expect(i.setEntry("pl", "{n} notes", "{n} zapisków")).toEqual({ ok: true });
    expect(i.catalog("pl")["{n} notes"]).toBe("{n} zapisków"); expect(i.review("pl").find((r) => r.en === "{n} notes")!.state).toBe("approved");
    expect(i.setEntry("pl", "{n} notes", "zapiski")).toEqual({ error: "placeholder" });
    expect(i.setEntry("pl", "Cancel", "  ")).toEqual({ error: "empty" });
    expect(i.setEntry("pl", "Nope", "x")).toEqual({ error: "not_found" });
    expect(i.setEntry("pl", "Open", "Otwórz!")).toEqual({ error: "not_found" });       // a shipped seed is reviewed in git, not here
  });
  test("restore English keeps the English on screen and does not queue the string again", () => {
    const i = mk();
    expect(i.revert("pl", "Cancel")).toEqual({ ok: true });
    expect(i.catalog("pl").Cancel).toBe("Cancel"); expect(i.review("pl").find((r) => r.en === "Cancel")!.state).toBe("english");
    expect(i.addMissing("pl", ["Cancel"])).toBe(0);
    expect(i.revert("pl", "Nope")).toEqual({ error: "not_found" });
  });
});

describe("review routes", () => {
  const app = (op: boolean) => { const a = new Hono(), i = mk(); i18nApi(a, () => op, () => async () => "[]", i); return a; };
  const call = (a: Hono, m: string, p: string, b?: unknown) => a.request(p, { method: m, headers: { "content-type": "application/json" }, body: b ? JSON.stringify(b) : undefined });
  test("list, edit, approve and revert work for the operator, in that shape", async () => {
    const a = app(true);
    const list = await (await call(a, "GET", "/api/i18n/pl/review")).json() as { en: string; state: string }[];
    expect(list.map((r) => r.en)).toEqual(["Cancel", "{n} notes", "Sync"]);
    expect((await call(a, "PUT", "/api/i18n/pl/entry", { en: "Cancel", pl: "Rezygnuj" })).status).toBe(200);
    expect((await call(a, "POST", "/api/i18n/pl/approve", { en: "{n} notes" })).status).toBe(200);
    expect((await call(a, "POST", "/api/i18n/pl/revert", { en: "Sync" })).status).toBe(200);
    const after = await (await call(a, "GET", "/api/i18n/pl/review")).json() as { en: string; pl: string; state: string }[];
    expect(after.find((r) => r.en === "Cancel")).toMatchObject({ pl: "Rezygnuj", state: "approved" });
    expect((await call(a, "PUT", "/api/i18n/pl/entry", { en: "Cancel", pl: "" })).status).toBe(400);
    expect((await call(a, "POST", "/api/i18n/pl/revert", { en: "Nope" })).status).toBe(404);
    expect((await call(a, "GET", "/api/i18n/xx/review")).status).toBe(404);
  });
  test("everyone else is refused", async () => {
    const a = app(false);
    expect((await call(a, "GET", "/api/i18n/pl/review")).status).toBe(403);
    expect((await call(a, "PUT", "/api/i18n/pl/entry", { en: "Cancel", pl: "x" })).status).toBe(403);
    expect((await call(a, "POST", "/api/i18n/pl/approve", { en: "Cancel" })).status).toBe(403);
    expect((await call(a, "POST", "/api/i18n/pl/revert", { en: "Cancel" })).status).toBe(403);
  });
});
