// PDF and Office files on a chat turn: read to text from bytes only, allowlisted by type and first bytes.
import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readDocuments, xmlText } from "../core/doc-text";
import { readAttachments } from "../core/attachments";

const have = (c: string) => !!Bun.which(c);
const dir = mkdtempSync(join(tmpdir(), "caesaros-dt-"));
/** A zip holding the given parts, made with the system zip tool. */
function zip(parts: Record<string, string>): string {
  const root = mkdtempSync(join(dir, "z-"));
  for (const [p, body] of Object.entries(parts)) { Bun.spawnSync(["mkdir", "-p", join(root, p, "..")]); writeFileSync(join(root, p), body); }
  Bun.spawnSync(["zip", "-q", "-r", join(root, "o.zip"), ...Object.keys(parts)], { cwd: root });
  return readFileSync(join(root, "o.zip")).toString("base64");
}
/** The smallest PDF that says one line. */
function pdf(line: string): string {
  const stream = line ? `BT /F1 18 Tf 20 100 Td (${line}) Tj ET` : "";
  const objs = ["<</Type/Catalog/Pages 2 0 R>>", "<</Type/Pages/Kids[3 0 R]/Count 1>>", "<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>", `<</Length ${stream.length}>>stream\n${stream}\nendstream`, "<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>"];
  let out = "%PDF-1.4\n"; const at: number[] = [];
  objs.forEach((o, i) => { at.push(out.length); out += `${i + 1} 0 obj${o}endobj\n`; });
  const x = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${at.map((a) => `${String(a).padStart(10, "0")} 00000 n \n`).join("")}trailer<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${x}\n%%EOF`;
  return Buffer.from(out).toString("base64");
}
const one = (name: string, data: string, mime = "application/octet-stream") => readDocuments([{ name, mime, data }]);

describe("documents on a chat turn", () => {
  test("XML becomes words; entities are read once; a made-up code point is left alone", () => {
    expect(xmlText('<w:p><w:r><w:t>Fish &amp; chips &#x41;&#66;</w:t></w:r></w:p><w:p><w:t>&amp;lt; &#99999999;</w:t></w:p>')).toBe("Fish & chips AB\n&lt; &#99999999;");
  });
  test.if(have("pdftotext"))("a PDF is read, and a page with no text is refused", async () => {
    const r = await one("Report.PDF", pdf("Quarterly harvest numbers"));
    expect(r.ok).toBe(true);
    const files = readAttachments(r.ok ? r.raw : null);
    expect(files.ok && files.items[0]).toMatchObject({ name: "Report.PDF", kind: "text" });
    expect(files.ok && files.items[0]!.data).toContain("Quarterly harvest numbers");
    expect(await one("blank.pdf", pdf(""))).toMatchObject({ ok: false, why: "no-text" });
  });
  test.if(have("unzip") && have("zip"))("Word, OpenDocument and PowerPoint are read, slides in number order", async () => {
    const d = await one("a.docx", zip({ "word/document.xml": "<w:p><w:t>Alpha</w:t></w:p>" }));
    expect(d.ok && (d.raw as { data: string }[])[0]!.data).toBe("Alpha");
    const o = await one("a.odt", zip({ "content.xml": "<text:p>Beta<text:s/>two</text:p>" }));
    expect(o.ok && (o.raw as { data: string }[])[0]!.data).toBe("Beta two");
    const p = await one("a.pptx", zip({ "ppt/slides/slide10.xml": "<a:p><a:t>ten</a:t></a:p>", "ppt/slides/slide2.xml": "<a:p><a:t>two</a:t></a:p>" }));
    expect(p.ok && (p.raw as { data: string }[])[0]!.data).toBe("Slide 1\ntwo\n\nSlide 2\nten");
    expect(await one("a.docx", zip({ "other.xml": "<x/>" }))).toMatchObject({ ok: false, why: "bad-file" });
  });
  test("the type is checked against the first bytes, size is capped and bad base64 is refused before any tool runs", async () => {
    expect(await one("a.pdf", Buffer.from("#!/bin/sh\necho hi").toString("base64"))).toMatchObject({ ok: false, why: "bad-file" });
    expect(await one("a.docx", Buffer.from("%PDF-1.4").toString("base64"))).toMatchObject({ ok: false, why: "bad-file" });
    expect(await one("a.pdf", "not base64!")).toMatchObject({ ok: false, why: "bad-file" });
    expect(await one("a.pdf", Buffer.alloc(9 * 1024 * 1024, 1).toString("base64"))).toMatchObject({ ok: false, why: "too-large" });
  });
  test("other files and over-long lists pass through for the attachment checks to judge", async () => {
    const list = Array(5).fill({ name: "a.pdf", mime: "application/pdf", data: "JVBERi0=" });
    expect(await readDocuments(list)).toEqual({ ok: true, raw: list });
    const txt = [{ name: "n.md", mime: "text/markdown", data: "hi" }];
    expect(await readDocuments(txt)).toEqual({ ok: true, raw: txt });
    expect(await readDocuments(undefined)).toEqual({ ok: true, raw: undefined });
  });
});

test("hostile markup does not stall the server", async () => {
  const { xmlText } = await import("../core/doc-text");
  const t = performance.now();
  for (const piece of ["<", "<w:br ", "<w:tab ", "<text:s "]) xmlText(piece.repeat(Math.ceil(400_000 / piece.length)));
  expect(performance.now() - t).toBeLessThan(5000);
});
