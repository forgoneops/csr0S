import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..", "web", "atrium");
const ns = readFileSync(join(root, "ns.js"), "utf8");
const setup = readFileSync(join(root, "setup.js"), "utf8");
const hubs = readFileSync(join(root, "hubs.js"), "utf8");

describe("optional module switches", () => {
  test("purpose groups cover the optional app catalogue and keep core out", () => {
    const groups = ns.match(/\{ id: '(?:day|knowledge|studio|business|crew|system)'[\s\S]*?defaults: \[[^\]]*\] \}/g) || [];
    expect(groups).toHaveLength(6);
    for (const app of ["Goals", "Ideas", "Schedule", "Tool graph", "Finance", "Media Gallery", "Fleet"]) {
      expect(ns).toContain(`'${app}'`);
    }
    expect(ns).toContain("window.MODULE_GROUPS = MODULE_GROUPS");
    expect(ns).toContain("OGS.mods = new Set(MODULE_GROUPS.flatMap(g => g.defaults))");
  });

  test("setup switches save enabled and disabled ids through settings", () => {
    expect(setup).toContain('data-su-module=');
    expect(setup).toContain("disabledModules: [...dis], enabledModules: [...ena]");
    expect(setup).toContain("window.applyOptionalModules?.(D.set)");
    expect(setup).toContain("await window.reloadWorkspaces?.()");
  });

  test("workspace load applies saved module state before drawing the board", () => {
    expect(hubs).toContain("window.applyOptionalModules?.(set)");
    expect(ns).toContain("if (!ogEnabled(n)");
  });
});
