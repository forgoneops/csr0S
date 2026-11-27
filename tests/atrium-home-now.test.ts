// Home, What now?: one compact strip; the full list is folded until asked for, so the workspace cards stay on the first screen.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const html = readFileSync(join(import.meta.dir, "..", "web", "atrium", "index.html"), "utf8");
const a = html.indexOf("const wnOpen=");
const src = html.slice(a, html.indexOf("function wsView(){"));
const build = (feed: string[][], open: boolean) => new Function("FEED", "esc", "localStorage", `${src}; return wnowHtml();`)(feed, (s: string) => s, { getItem: () => (open ? "1" : "0") }) as string;
const feed = [["Today", "09:00 Briefing", "On your schedule", "Schedule", "Open"], ["Board", "In progress", "Move it", "Board", "Open"], ["Backup", "No backup", "Copy", "Settings", "Open"]];

describe("What now? strip", () => {
  test("folded by default: first item and a count, no list", () => {
    const h = build(feed, false);
    expect(h).toContain("3 to look at"); expect(h).toContain("09:00 Briefing"); expect(h).toContain('aria-expanded="false"');
    expect(h).not.toContain("<ul");
  });
  test("unfolds on demand to every item", () => {
    const h = build(feed, true);
    expect((h.match(/<li>/g) || []).length).toBe(3); expect(h).toContain('aria-expanded="true"');
  });
  test("empty feed is a calm one-liner with no toggle", () => {
    const h = build([], false);
    expect(h).toContain("All clear"); expect(h).not.toContain("wn-more");
  });
});
