/**
 * Tests for Word (.docx) attachments: app/utils/docxText.js and its use by
 * useAttachments. The document's text is extracted and attached as a text
 * file, so it works with any model.
 */

import { describe, it, expect } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { isDocxFile, documentXmlToText, notesXmlToText, extractDocxText, DOCX_MIME_TYPE, MAX_DOCX_PART_BYTES } from "../app/utils/docxText.js";
import { decodeTextDataUrl, attachmentsToContentParts, isTextFile } from "../app/utils/attachmentParts.js";
import { useAttachments } from "../app/composables/useAttachments.js";

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

function documentXml(body) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${body}</w:body></w:document>`;
}

function paragraph(text, properties = "") {
  return `<w:p>${properties ? `<w:pPr>${properties}</w:pPr>` : ""}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
}

function docxBytes(body, extraParts = {}) {
  return zipSync({
    "[Content_Types].xml": strToU8("<Types/>"),
    "word/document.xml": strToU8(documentXml(body)),
    ...Object.fromEntries(Object.entries(extraParts).map(([name, xml]) => [name, strToU8(xml)])),
  });
}

function docxFile(name, body, type = DOCX_MIME_TYPE) {
  return new File([docxBytes(body)], name, { type });
}

describe("isDocxFile", () => {
  it("recognises the Word MIME type and the .docx extension", () => {
    expect(isDocxFile({ name: "report", type: DOCX_MIME_TYPE })).toBe(true);
    expect(isDocxFile({ name: "Report.DOCX", type: "" })).toBe(true);
    expect(isDocxFile({ name: "report.docx", type: "application/octet-stream" })).toBe(true);
  });

  it("rejects other files", () => {
    expect(isDocxFile({ name: "a.pdf", type: "application/pdf" })).toBe(false);
    expect(isDocxFile({ name: "a.doc", type: "application/msword" })).toBe(false);
    expect(isDocxFile({ name: "a.txt", type: "text/plain" })).toBe(false);
    expect(isTextFile({ name: "a.docx", type: DOCX_MIME_TYPE })).toBe(false);
  });
});

describe("documentXmlToText", () => {
  it("keeps paragraphs, runs, tabs and line breaks", () => {
    const xml = documentXml(
      '<w:p><w:r><w:t>Hello</w:t></w:r><w:r><w:t xml:space="preserve"> world</w:t></w:r></w:p>' +
        "<w:p><w:r><w:t>a</w:t><w:tab/><w:t>b</w:t><w:br/><w:t>c</w:t></w:r></w:p>",
    );
    expect(documentXmlToText(xml)).toBe("Hello world\na\tb\nc");
  });

  it("does not treat tab stops in paragraph properties as tabs", () => {
    const xml = documentXml(paragraph("x", '<w:tabs><w:tab w:val="left" w:pos="720"/></w:tabs>'));
    expect(documentXmlToText(xml)).toBe("x");
  });

  it("decodes XML entities", () => {
    const xml = documentXml(paragraph("a &lt;b&gt; &amp; &quot;c&quot; &#233; &#x1F680;"));
    expect(documentXmlToText(xml)).toBe('a <b> & "c" é 🚀');
  });

  it("marks headings and list items", () => {
    const xml = documentXml(
      paragraph("Title", '<w:pStyle w:val="Title"/>') +
        paragraph("Section", '<w:pStyle w:val="Heading2"/>') +
        paragraph("item", '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>') +
        paragraph("styled item", '<w:pStyle w:val="ListBullet"/>'),
    );
    expect(documentXmlToText(xml)).toBe("# Title\n## Section\n- item\n- styled item");
  });

  it("separates table cells with tabs and rows with newlines", () => {
    const cell = (text) => `<w:tc>${paragraph(text)}</w:tc>`;
    const xml = documentXml(
      `<w:tbl><w:tr>${cell("a")}${cell("b")}</w:tr><w:tr>${cell("c")}${cell("d")}</w:tr></w:tbl>` + paragraph("after"),
    );
    expect(documentXmlToText(xml)).toBe("a\tb\nc\td\nafter");
  });

  it("keeps one line per table row, with multi-line and empty cells", () => {
    const cell = (...texts) => `<w:tc><w:tcPr/>${texts.length ? texts.map((t) => paragraph(t)).join("") : "<w:p/>"}</w:tc>`;
    const xml = documentXml(
      `<w:tbl><w:tblPr/><w:tr>${cell()}${cell("line 1", "line 2")}${cell()}</w:tr><w:tr>${cell("x")}${cell("y")}${cell("z")}</w:tr></w:tbl>`,
    );
    expect(documentXmlToText(xml)).toBe("\tline 1 line 2\t\nx\ty\tz");
  });

  it("keeps rows and cells wrapped in content controls", () => {
    const cell = (text) => `<w:tc>${paragraph(text)}</w:tc>`;
    const sdt = (inner) => `<w:sdt><w:sdtPr><w:alias w:val="x"/></w:sdtPr><w:sdtContent>${inner}</w:sdtContent></w:sdt>`;
    const xml = documentXml(
      `<w:tbl><w:tr>${cell("a")}${sdt(cell("b"))}${cell("c")}</w:tr>${sdt(`<w:tr>${cell("d")}${cell("e")}${cell("f")}</w:tr>`)}</w:tbl>`,
    );
    expect(documentXmlToText(xml)).toBe("a\tb\tc\nd\te\tf");
  });

  it("handles empty self-closing text runs", () => {
    const xml = documentXml(
      '<w:p><w:r><w:t xml:space="preserve"/></w:r></w:p><w:p><w:r><w:t>second</w:t></w:r></w:p><w:p><w:r><w:t>third</w:t></w:r></w:p>',
    );
    expect(documentXmlToText(xml)).toBe("second\nthird");
  });

  it("includes Office Math equation text", () => {
    const xml = documentXml(
      '<w:p><w:r><w:t xml:space="preserve">Area: </w:t></w:r><m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><m:r><m:t>A=πr</m:t></m:r><m:sSup><m:e><m:r><m:t>2</m:t></m:r></m:e></m:sSup></m:oMath></w:p>',
    );
    expect(documentXmlToText(xml)).toBe("Area: A=πr2");
  });

  it("throws on malformed XML", () => {
    expect(() => documentXmlToText(documentXml(paragraph("ok")).slice(0, -40))).toThrow();
  });

  it("stays fast on large tables", () => {
    const row = `<w:tr>${"<w:tc><w:p><w:r><w:t>cell</w:t></w:r></w:p></w:tc>".repeat(10)}</w:tr>`;
    const xml = documentXml(`<w:tbl>${row.repeat(5000)}</w:tbl>`);
    const start = performance.now();
    const text = documentXmlToText(xml);
    expect(text.split("\n")).toHaveLength(5000);
    expect(performance.now() - start).toBeLessThan(5000);
  });

  it("ignores deleted text and field codes", () => {
    const xml = documentXml(
      '<w:p><w:r><w:delText>gone</w:delText></w:r><w:r><w:instrText> PAGE </w:instrText></w:r><w:r><w:t>kept</w:t></w:r></w:p>',
    );
    expect(documentXmlToText(xml)).toBe("kept");
  });
});

describe("extractDocxText", () => {
  it("reads word/document.xml from the zip", () => {
    expect(extractDocxText(docxBytes(paragraph("one") + paragraph("two")))).toBe("one\ntwo");
  });

  it("appends footnotes and endnotes after the body", () => {
    const notes = (kind) =>
      `<w:${kind}s ${W}><w:${kind} w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:${kind}>` +
      `<w:${kind} w:id="1"><w:p><w:r><w:${kind}Ref/></w:r><w:r><w:t xml:space="preserve"> ${kind} text</w:t></w:r></w:p></w:${kind}></w:${kind}s>`;
    const body =
      '<w:p><w:r><w:t>Claim</w:t></w:r><w:r><w:footnoteReference w:id="1"/></w:r><w:r><w:t xml:space="preserve"> and more</w:t></w:r><w:r><w:endnoteReference w:id="1"/></w:r></w:p>';
    const bytes = docxBytes(body, { "word/footnotes.xml": notes("footnote"), "word/endnotes.xml": notes("endnote") });
    expect(extractDocxText(bytes)).toBe("Claim[^1] and more[^e1]\n\n[^1]: footnote text\n\n[^e1]: endnote text");
    expect(notesXmlToText(notes("footnote"), "footnote")).toBe("[^1]: footnote text");
  });

  it("refuses parts that would inflate past the size cap", () => {
    const huge = new Uint8Array(MAX_DOCX_PART_BYTES + 1);
    const bytes = zipSync({ "word/document.xml": huge });
    expect(() => extractDocxText(bytes)).toThrow("Not a valid .docx file");
  });

  it("throws for data that is not a Word document", () => {
    expect(() => extractDocxText(strToU8("not a zip"))).toThrow();
    expect(() => extractDocxText(zipSync({ "a.txt": strToU8("x") }))).toThrow();
  });
});

describe("useAttachments with .docx files", () => {
  it("attaches the extracted text as a text attachment, without vision", async () => {
    const { addFile, attachments, error } = useAttachments();
    const result = await addFile(docxFile("notes.docx", paragraph("Meeting notes") + paragraph("Ship it")), false);

    expect(result).toEqual({ success: true });
    expect(error.value).toBe(null);
    expect(attachments.value).toHaveLength(1);
    const [attachment] = attachments.value;
    expect(attachment).toMatchObject({ type: "text", filename: "notes.docx", mimeType: "text/plain" });
    expect(decodeTextDataUrl(attachment.dataUrl)).toBe("Meeting notes\nShip it");

    const parts = attachmentsToContentParts(attachments.value);
    expect(parts).toHaveLength(1);
    expect(parts[0].type).toBe("text");
    expect(parts[0].text).toContain("notes.docx");
    expect(parts[0].text).toContain("Ship it");
  });

  it("accepts a .docx the browser reports without a MIME type", async () => {
    const { addFile, attachments } = useAttachments();
    const result = await addFile(docxFile("x.docx", paragraph("hi"), ""), false);
    expect(result.success).toBe(true);
    expect(attachments.value[0].type).toBe("text");
  });

  it("reports a corrupt .docx", async () => {
    const { addFile, attachments, error } = useAttachments();
    const result = await addFile(new File(["garbage"], "bad.docx", { type: DOCX_MIME_TYPE }), false);
    expect(result.success).toBe(false);
    expect(error.value).toContain("could not be read as a Word document");
    expect(attachments.value).toHaveLength(0);
  });

  it("reports a .docx with no text", async () => {
    const { addFile, attachments, error } = useAttachments();
    const result = await addFile(docxFile("empty.docx", "<w:p/>"), false);
    expect(result.success).toBe(false);
    expect(error.value).toContain("has no text");
    expect(attachments.value).toHaveLength(0);
  });
});
