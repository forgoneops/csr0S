// Gate R45: the core imports nothing from the owner layer. This scans every file the core build ships
// and every import specifier in it, so a single `import "../owner/x"` fails the suite.
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, dirname, extname } from "node:path";

const ROOT = join(import.meta.dir, "..");
const CORE = join(ROOT, "core");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

const specifiers = (src: string): string[] => {
  const out: string[] = [];
  const patterns = [/from\s+["']([^"']+)["']/g, /import\s+["']([^"']+)["']/g, /import\(\s*["']([^"']+)["']\s*\)/g, /require\(\s*["']([^"']+)["']\s*\)/g];
  for (const re of patterns) for (const m of src.matchAll(re)) out.push(m[1]);
  return out;
};

const BARE_OK = ["hono", "zod", "react", "react-dom", "react/jsx-runtime", "imapflow", "mailparser", "nodemailer"];   // the last three are the mail client's wire libraries (MIT), runtime dependencies of the core

describe("core imports", () => {
  const coreFiles = files(CORE).filter((f) => [".ts", ".tsx"].includes(extname(f)));

  test("the core has files to check", () => {
    expect(coreFiles.length).toBeGreaterThan(5);
  });

  test("every import stays inside core/ or a runtime package", () => {
    const bad: string[] = [];
    for (const file of coreFiles) {
      for (const spec of specifiers(readFileSync(file, "utf8"))) {
        const where = `${relative(ROOT, file)} -> ${spec}`;
        if (spec.startsWith("node:") || spec.startsWith("bun:")) continue;
        if (!spec.startsWith(".")) {
          const pkg = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
          if (!BARE_OK.includes(pkg) && !BARE_OK.includes(spec)) bad.push(`${where} (outside package)`);
          continue;
        }
        const target = resolve(dirname(file), spec);
        const insideCore = relative(CORE, target);
        if (insideCore.startsWith("..") || insideCore.startsWith("/")) bad.push(`${where} (leaves core/)`);
      }
    }
    expect(bad).toEqual([]);
  });

  test("no file in the core names the owner layer at all", () => {
    const hits = coreFiles.filter((f) => /owner\//.test(readFileSync(f, "utf8")) && !f.endsWith("plugins.ts"));
    expect(hits).toEqual([]);
  });

  test("the web app imports nothing from the owner layer either", () => {
    const webFiles = files(join(ROOT, "web", "src")).filter((f) => [".ts", ".tsx"].includes(extname(f)));
    const bad: string[] = [];
    for (const file of webFiles) {
      for (const spec of specifiers(readFileSync(file, "utf8"))) {
        if (spec.includes("owner")) bad.push(`${relative(ROOT, file)} -> ${spec}`);
        if (spec.startsWith(".") && resolve(dirname(file), spec).includes(`${ROOT}/owner`)) bad.push(`${relative(ROOT, file)} -> ${spec}`);
      }
      if (/["']\.\.\/\.\.\/owner/.test(readFileSync(file, "utf8"))) bad.push(`${relative(ROOT, file)} (owner path)`);
    }
    expect(bad).toEqual([]);
  });
});
