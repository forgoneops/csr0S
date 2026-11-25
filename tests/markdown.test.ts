// Chat replies are untrusted text. The parser must never produce HTML or a link that runs code,
// must stay linear on hostile input, and must handle a reply that is still streaming.
import { describe, expect, test } from "bun:test";
import { parseInline, parseMarkdown, safeHref } from "../web/src/ui/markdown";

const flat = (n: ReturnType<typeof parseInline>): string => n.map((x) => x.t === "text" || x.t === "code" ? x.v : flat(x.c)).join("");

describe("links and html", () => {
  test("only http, https and mailto become links", () => {
    expect(safeHref("https://a.example/x?y=1")).toBe("https://a.example/x?y=1");
    expect(safeHref("mailto:a@example.com")).toBe("mailto:a@example.com");
    for (const bad of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,<b>", "//evil.example", "file:///etc/passwd", "vbscript:x", " javascript:1"]) expect(safeHref(bad)).toBeNull();
  });
  test("an unsafe link is text, a safe one is a link with its label parsed", () => {
    expect(parseInline("[x](javascript:alert(1))")).toEqual([{ t: "text", v: "x (javascript:alert(1))" }]);
    expect(parseInline("[**go**](https://a.example)")).toEqual([{ t: "a", href: "https://a.example", c: [{ t: "strong", c: [{ t: "text", v: "go" }] }] }]);
  });
  test("raw html stays text, so React shows it instead of running it", () => {
    const b = parseMarkdown('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>');
    expect(b.map((x) => x.t)).toEqual(["p", "p"]);
    expect(flat((b[0] as { c: ReturnType<typeof parseInline> }).c)).toBe("<script>alert(1)</script>");
  });
});

describe("inline", () => {
  test("code protects its contents; bold and italic nest", () => {
    expect(parseInline("`a*b*c`")).toEqual([{ t: "code", v: "a*b*c" }]);
    expect(flat(parseInline("**bold _and italic_**"))).toBe("bold and italic");
    expect(parseInline("see [w](https://a.example/x_(y))")[1]).toMatchObject({ t: "a", href: "https://a.example/x_(y)" });   // one level of parentheses in a url
  });
  test("snake_case and spaced stars are not emphasis", () => {
    expect(parseInline("use snake_case_name here")).toEqual([{ t: "text", v: "use snake_case_name here" }]);
    expect(parseInline("2 * 3 * 4")).toEqual([{ t: "text", v: "2 * 3 * 4" }]);
    expect(parseInline("_em_")).toEqual([{ t: "em", c: [{ t: "text", v: "em" }] }]);
  });
  test("an unclosed marker stays literal", () => {
    expect(flat(parseInline("**never closed and `neither"))).toBe("**never closed and `neither");
  });
});

describe("blocks", () => {
  test("headings, rule, lists, quote and paragraphs", () => {
    const b = parseMarkdown("# Title\n\ntext line one\ntext line two\n\n- a\n- b\n\n1. x\n2) y\n\n> quoted\n> more\n\n---");
    expect(b.map((x) => x.t)).toEqual(["h", "p", "ul", "ol", "quote", "hr"]);
    expect((b[2] as { items: unknown[] }).items).toHaveLength(2);
    expect((b[3] as { items: unknown[] }).items).toHaveLength(2);
  });
  test("a fenced block keeps its text exactly, with language, and a closing fence ends it", () => {
    const b = parseMarkdown("before\n```ts\nconst a = 1 * 2 * 3;\n# not a heading\n```\nafter");
    expect(b).toEqual([{ t: "p", c: [{ t: "text", v: "before" }] }, { t: "code", lang: "ts", v: "const a = 1 * 2 * 3;\n# not a heading" }, { t: "p", c: [{ t: "text", v: "after" }] }]);
  });
  test("a reply still streaming: an unclosed fence runs to the end and nothing throws", () => {
    expect(parseMarkdown("```py\nprint(1)\nprint(")).toEqual([{ t: "code", lang: "py", v: "print(1)\nprint(" }]);
    for (const partial of ["#", "- ", "1.", ">", "**", "[a](", "`", "```", "~~~\nx"]) expect(() => parseMarkdown(partial)).not.toThrow();
  });
  test("empty input is no blocks; CRLF is handled", () => {
    expect(parseMarkdown("")).toEqual([]);
    expect(parseMarkdown("a\r\n\r\nb").map((x) => x.t)).toEqual(["p", "p"]);
  });
});

describe("hostile input stays fast", () => {
  test("long runs of markers do not blow up", () => {
    for (const evil of ["*a".repeat(30000), "**".repeat(30000), "[".repeat(20000), "`".repeat(30000), "_a".repeat(30000), "[a](" + "x".repeat(50000), "- ".repeat(30000)]) {
      const t0 = performance.now();
      parseMarkdown(evil);
      expect(performance.now() - t0).toBeLessThan(400);
    }
  });

  test("tables and nested lists (R: chat depth)", () => {
    const t = parseMarkdown("| Name | N |\n|:--|--:|\n| a **b** | 1 |\n| c | 2 |\n\ntext") as any[];
    expect(t.map((x) => x.t)).toEqual(["table", "p"]);
    expect(t[0].head).toHaveLength(2); expect(t[0].align).toEqual(["l", "r"]); expect(t[0].rows).toHaveLength(2);
    const l = parseMarkdown("- one\n  - two\n    1. three\n- four") as any[];
    expect(l).toHaveLength(1); expect(l[0].items).toHaveLength(2);
    expect(l[0].items[0].sub[0].items[0].sub[0].t).toBe("ol");
    // a pipe in a plain sentence is not a table, and hostile depth and width stay capped
    expect(parseMarkdown("a | b\nc").map((x) => x.t)).toEqual(["p"]);
    const deep = parseMarkdown(Array.from({ length: 12 }, (_, d) => `${" ".repeat(d * 2)}- x${d}`).join("\n"));
    expect(deep).toHaveLength(1);
    const wide = parseMarkdown(`|${"a|".repeat(40)}\n|${"-|".repeat(40)}`) as any[];
    expect(wide[0].head.length).toBeLessThanOrEqual(12);
  });
});
