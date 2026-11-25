import { expect, test } from "bun:test";
import { cleanPrompt, start } from "../core/imagegen";

test("a prompt is trimmed and kept between 3 and 400 characters", () => {
  expect(cleanPrompt("  a   red  fox ")).toBe("a red fox");
  expect(cleanPrompt("ab")).toBeNull(); expect(cleanPrompt("x".repeat(401))).toBeNull(); expect(cleanPrompt(5)).toBeNull();
});
test("without the install it refuses plainly instead of starting anything", () => {
  const old = process.env.CAESAROS_IMAGE_DIR; process.env.CAESAROS_IMAGE_DIR = "/nonexistent-image-dir";
  try { expect(start("a fox", 256)).toEqual({ error: "not_installed" }); } finally { if (old === undefined) delete process.env.CAESAROS_IMAGE_DIR; else process.env.CAESAROS_IMAGE_DIR = old; }
});
