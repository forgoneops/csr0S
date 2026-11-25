import { describe, expect, test } from "bun:test";
import { LIMITS, readAttachments, withTextFiles } from "../core/attachments";

const b64 = (n: number) => Buffer.alloc(n, 1).toString("base64");

describe("attachment limits", () => {
  test("none is fine; an image and a text file are read; sizes are measured", () => {
    expect(readAttachments(undefined)).toEqual({ ok: true, items: [] });
    const r = readAttachments([{ name: "a.png", mime: "image/png", data: b64(300) }, { name: "n.md", mime: "text/markdown", data: "héllo" }]);
    expect(r.ok && r.items.map((i) => [i.kind, i.size])).toEqual([["image", 300], ["text", 6]]);
  });
  test("too many, too large, total, unsupported, binary-as-text, bad base64 are each refused for their own reason", () => {
    const img = { name: "a.png", mime: "image/png", data: b64(10) };
    expect(readAttachments(Array(5).fill(img))).toMatchObject({ ok: false, why: "too-many" });
    expect(readAttachments([{ ...img, data: b64(LIMITS.image + 3) }])).toMatchObject({ ok: false, why: "too-large", name: "a.png" });
    expect(readAttachments([{ name: "big.txt", mime: "text/plain", data: "x".repeat(LIMITS.text + 1) }])).toMatchObject({ ok: false, why: "too-large" });
    expect(readAttachments(Array(4).fill({ ...img, data: b64(LIMITS.image - 10) }))).toMatchObject({ ok: false, why: "total-too-large" });
    expect(readAttachments([{ name: "a.pdf", mime: "application/pdf", data: "JVBERi0=" }])).toMatchObject({ ok: false, why: "unsupported", name: "a.pdf" });
    expect(readAttachments([{ name: "a.txt", mime: "text/plain", data: "a\u0000b" }])).toMatchObject({ ok: false, why: "unsupported" });
    expect(readAttachments([{ ...img, data: "not base64!" }])).toMatchObject({ ok: false, why: "bad-file" });
    expect(readAttachments("nope")).toMatchObject({ ok: false, why: "bad-file" });
  });
  test("a stored text file is shown to the engine fenced and named; an image adds nothing", () => {
    expect(withTextFiles("read it", [{ name: "n.txt", kind: "text", mime: "text/plain", size: 2, text: "hi" }, { name: "p.png", kind: "image", mime: "image/png", size: 1 }]))
      .toBe("read it\n\n[Attached file: n.txt]\n```\nhi\n```");
  });
});
