import { test, expect } from "bun:test";
import { readFileSync } from "fs";

// The Text size setting changes the root font size, so every size must be in rem or it does nothing.
for (const f of ["web/src/base.css", "web/src/terminal/terminal.css", ...Array.from(new Bun.Glob("web/src/**/*.css").scanSync(".")).filter((x) => !["web/src/base.css", "web/src/terminal/terminal.css"].includes(x))]) {
  test(`${f} has no px font sizes`, () => {
    const css = readFileSync(f, "utf8");
    // a px size is allowed only as the cap inside min(<rem>, <px>), which still scales below the cap
    expect((css.match(/font(-size)?:[^;{}]*\b[0-9.]+px/g) ?? []).filter((m) => !/min\([0-9.]+rem,[0-9.]+px$/.test(m))).toEqual([]);
  });
}
