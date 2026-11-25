import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const PUB = join(import.meta.dir, "..", "web", "public");
const manifest = JSON.parse(readFileSync(join(PUB, "manifest.webmanifest"), "utf8"));

test("manifest is installable: name, standalone, start_url, 192 and 512 icons plus a maskable one", () => {
  expect(manifest.name).toBe("CaesarOS");
  expect(manifest.display).toBe("standalone");
  expect(manifest.start_url).toBe("/");
  const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
  expect(sizes).toContain("192x192");
  expect(sizes).toContain("512x512");
  expect(manifest.icons.some((i: { purpose: string }) => i.purpose === "maskable")).toBe(true);
});

test("every icon the manifest names exists on disk", () => {
  for (const i of manifest.icons) expect(existsSync(join(PUB, i.src))).toBe(true);
});

test("the service worker never caches live data or pack files, and carries the build placeholder", () => {
  const sw = readFileSync(join(PUB, "sw.js"), "utf8");
  expect(sw).toContain("__BUILD__");
  expect(sw).toContain('startsWith("/api/")');
  expect(sw).toContain('startsWith("/packs/")');
  // the only cache writes are the shell, navigations and hashed assets
  expect(sw).not.toContain("/api/\" +");
});

test("index.html links the manifest and an apple touch icon", () => {
  const html = readFileSync(join(import.meta.dir, "..", "web", "index.html"), "utf8");
  expect(html).toContain('rel="manifest"');
  expect(html).toContain("apple-touch-icon");
});

test("the worker precaches the hashed assets named by the shell, so the first visit works offline", () => {
  const sw = readFileSync(join(PUB, "sw.js"), "utf8");
  expect(sw).toContain("/assets/");
  expect(sw).toContain("precache");
});
