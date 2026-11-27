import { expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");

test("the compile entry embeds every shipped module that has a server.ts", () => {
  const listed = [...readFileSync(join(ROOT, "tools/compile-entry.ts"), "utf8").matchAll(/"((?:plugins|core\/modules)\/[a-z0-9-]+)": \(\) => import/g)].map((m) => m[1]);
  const found: string[] = [];
  for (const root of ["plugins", "core/modules"]) for (const id of readdirSync(join(ROOT, root))) if (existsSync(join(ROOT, root, id, "server.ts"))) found.push(`${root}/${id}`);
  expect(listed.sort()).toEqual(found.sort());
});
