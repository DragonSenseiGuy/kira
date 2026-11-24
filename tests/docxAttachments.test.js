/**
 * Tests for Word (.docx) attachments: app/utils/docxText.js and its use by
 * useAttachments. The document's text is extracted and attached as a text
 * file, so it works with any model.
 */

import { describe, it, expect } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { isDocxFile, documentXmlToText, extractDocxText, DOCX_MIME_TYPE } from "../app/utils/docxText.js";
import { decodeTextDataUrl, attachmentsToContentParts, isTextFile } from "../app/utils/attachmentParts.js";
import { useAttachments } from "../app/composables/useAttachments.js";

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

function documentXml(body) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${body}</w:body></w:document>`;
}

function paragraph(text, properties = "") {
  return `<w:p>${properties ? `<w:pPr>${properties}</w:pPr>` : ""}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
}

function docxBytes(body) {
  return zipSync({
    "[Content_Types].xml": strToU8("<Types/>"),
    "word/document.xml": strToU8(documentXml(body)),
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
