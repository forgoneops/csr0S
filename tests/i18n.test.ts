// R25: English and Polish are the same product. Both dictionaries must carry exactly the same keys, and
// every key used by the shell must exist. A one-sided string fails here, not on someone's screen.
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { DICTS, LANGS, allKeys, codeText, translate } from "../web/src/i18n";

const SRC = join(import.meta.dir, "..", "web", "src");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? files(p) : [p]; });
}

describe("i18n", () => {
  test("both languages have the same keys", () => {
    expect(allKeys("pl")).toEqual(allKeys("en"));
  });

  test("no key is empty in either language", () => {
    for (const lang of LANGS) for (const key of allKeys(lang)) expect({ lang, key, value: DICTS[lang][key].trim().length > 0 }).toEqual({ lang, key, value: true });
  });

  test("every t(\"…\") the shell uses exists in both languages", () => {
    const used = new Set<string>();
    for (const file of files(SRC).filter((f) => /\.tsx$/.test(f))) {
      for (const m of readFileSync(file, "utf8").matchAll(/\bt\(\s*"([a-z0-9.-]+)"/g)) used.add(m[1]);
    }
    const missingEn = [...used].filter((k) => !(k in DICTS.en));
    const missingPl = [...used].filter((k) => !(k in DICTS.pl));
    expect({ missingEn, missingPl }).toEqual({ missingEn: [], missingPl: [] });
    expect(used.size).toBeGreaterThan(20);
  });

  test("dynamic engine keys resolve in both languages", () => {
    for (const lang of LANGS) for (const e of ["local", "vps", "offline"]) expect(DICTS[lang][`settings.engine.${e}`]).toBeTruthy();
    for (const lang of LANGS) for (const g of ["talk", "day", "work", "knowledge", "make", "system"]) expect(DICTS[lang][`nav.group.${g}`]).toBeTruthy();
  });
});

// Codes the server can send are shown through codeText: none may reach the screen as a raw key, in either language.

describe("server error codes are all translated", () => {
  const src = (f: string) => readFileSync(join(import.meta.dir, "..", "core", f), "utf8");
  const codes = (f: string) => [...new Set([...src(f).matchAll(/error: "([a-z_]+)"/g)].map((m) => m[1]))];
  test("gateway and model-server codes", () => {
    for (const code of [...codes("gateways.ts"), ...codes("model-servers.ts"), "unreachable"])
      for (const lang of ["en", "pl"] as const) {
        const out = codeText(lang, "devices.err", code, "devices.err.unreachable");
        expect(out).not.toContain("devices.err");
        expect(out.length).toBeGreaterThan(2);
      }
  });
  test("note codes", () => {
    for (const code of [...codes("notes.ts"), "operator_only"])
      for (const lang of ["en", "pl"] as const) expect(codeText(lang, "notes.err", code, "notes.err.error")).not.toContain("notes.err");
  });
  test("an unknown status becomes one generic line with its number, an unknown code the fallback", () => {
    expect(codeText("en", "devices.err", "http_429", "devices.err.unreachable")).toBe("Answered with status 429");
    expect(codeText("pl", "devices.err", "http_418", "devices.err.unreachable")).toContain("418");
    expect(codeText("en", "devices.err", "weird_code", "devices.err.unreachable")).toBe(translate("en", "devices.err.unreachable"));
    expect(codeText("en", "devices.err", undefined, "devices.err.unreachable")).toBe(translate("en", "devices.err.unreachable"));
  });
});

describe("wording that must stay out of the interface", () => {
  const all = (lang: "en" | "pl") => Object.entries(DICTS[lang]);
  test("no internal register or decision ids reach the person (R28, D2, N1 ...)", () => {
    for (const lang of ["en", "pl"] as const)
      for (const [k, v] of all(lang)) expect({ lang, k, leak: /\b[RNSD]\d{1,2}\b|decision|decyzj/i.test(v) }).toEqual({ lang, k, leak: false });
  });
  test("Polish uses one word per thing: komputer not maszyna, zestaw not paczka, Czat for the module", () => {
    for (const [k, v] of all("pl")) expect({ k, bad: /maszyn|paczk|powłok[aąęi] (offline|nie mogła)/i.test(v) }).toEqual({ k, bad: false });
  });
});
