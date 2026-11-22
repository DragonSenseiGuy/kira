/**
 * Tests for text/code file attachments (app/utils/attachmentParts.js and
 * its use by useAttachments + formatMessageForAPI).
 *
 * Text files are stored like every other attachment (a data URL) and are
 * sent to the model as an <attached_file> text block, so they work with
 * any model — no vision or file-parsing support needed.
 */

import { describe, it, expect } from "vitest";
import {
  isTextFile,
  decodeTextDataUrl,
  attachmentsToContentParts,
} from "../app/utils/attachmentParts.js";
import { useAttachments } from "../app/composables/useAttachments.js";
import { formatMessageForAPI } from "../app/composables/messageFormat.js";
import { estimateMessageTokens, formatMessageForSummaryPrompt } from "../app/composables/contextCompressor.js";

function textDataUrl(text, mime = "text/plain") {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:${mime};base64,${btoa(binary)}`;
}

describe("isTextFile", () => {
  it("accepts text MIME types", () => {
    expect(isTextFile({ name: "notes", type: "text/plain" })).toBe(true);
    expect(isTextFile({ name: "data", type: "text/csv" })).toBe(true);
    expect(isTextFile({ name: "x", type: "application/json" })).toBe(true);
  });

  it("accepts common text and code extensions when the MIME type is missing", () => {
    for (const name of ["a.txt", "README.md", "data.CSV", "app.py", "main.ts", "x.json", "conf.yaml", "q.sql", "run.sh", "App.vue", "server.log"]) {
      expect(isTextFile({ name, type: "" })).toBe(true);
    }
  });

  it("rejects binary formats", () => {
    expect(isTextFile({ name: "a.png", type: "image/png" })).toBe(false);
    expect(isTextFile({ name: "a.pdf", type: "application/pdf" })).toBe(false);
    expect(isTextFile({ name: "a.zip", type: "application/zip" })).toBe(false);
    expect(isTextFile({ name: "a.docx", type: "" })).toBe(false);
    expect(isTextFile({ name: "noextension", type: "" })).toBe(false);
  });
});

describe("decodeTextDataUrl", () => {
  it("round-trips UTF-8 text", () => {
    const text = "héllo wörld — 你好 🚀\nline two";
    expect(decodeTextDataUrl(textDataUrl(text))).toBe(text);
  });

  it("returns an empty string for anything it cannot decode", () => {
    expect(decodeTextDataUrl("")).toBe("");
    expect(decodeTextDataUrl(undefined)).toBe("");
    expect(decodeTextDataUrl("not a data url")).toBe("");
  });
});

describe("attachmentsToContentParts", () => {
  it("keeps the existing image and PDF formats", () => {
    const parts = attachmentsToContentParts([
      { type: "image", filename: "a.webp", dataUrl: "data:image/webp;base64,AAAA" },
      { type: "pdf", filename: "b.pdf", dataUrl: "data:application/pdf;base64,BBBB" },
    ]);
    expect(parts).toEqual([
      { type: "image_url", image_url: { url: "data:image/webp;base64,AAAA" } },
      { type: "file", file: { filename: "b.pdf", file_data: "data:application/pdf;base64,BBBB" } },
    ]);
  });

  it("sends a text file as a named text block", () => {
    const parts = attachmentsToContentParts([
      { type: "text", filename: "notes.md", dataUrl: textDataUrl("# Title\nbody") },
    ]);
    expect(parts).toHaveLength(1);
    expect(parts[0].type).toBe("text");
    expect(parts[0].text).toContain("notes.md");
    expect(parts[0].text).toContain("# Title\nbody");
    expect(parts[0].text).toMatch(/^<attached_file /);
  });

  it("escapes the file name so it cannot break out of the block header", () => {
    const [part] = attachmentsToContentParts([
      { type: "text", filename: 'a"><evil>.txt', dataUrl: textDataUrl("x") },
    ]);
    expect(part.text.split("\n")[0]).not.toContain('"><evil>');
  });

  it("truncates very large text files", () => {
    const [part] = attachmentsToContentParts([
      { type: "text", filename: "big.txt", dataUrl: textDataUrl("a".repeat(500_000)) },
    ]);
    expect(part.text.length).toBeLessThan(100_000);
    expect(part.text).toMatch(/truncated/i);
  });

  it("skips unknown attachment types and tolerates missing input", () => {
    expect(attachmentsToContentParts([{ type: "mystery", filename: "x" }])).toEqual([]);
    expect(attachmentsToContentParts(undefined)).toEqual([]);
  });
});

describe("formatMessageForAPI with a text attachment", () => {
  it("puts the user's words first, then the file", () => {
    const message = formatMessageForAPI({
      role: "user",
      content: "Summarise this",
      attachments: [{ id: "1", type: "text", filename: "notes.txt", dataUrl: textDataUrl("the notes") }],
    });

    expect(message.content[0]).toEqual({ type: "text", text: "Summarise this" });
    expect(message.content[1].type).toBe("text");
    expect(message.content[1].text).toContain("the notes");
  });
});

describe("useAttachments with text files", () => {
  it("attaches a text file without a vision model", async () => {
    const { addFile, attachments, error } = useAttachments();
    const file = new File(["print('hi')\n"], "script.py", { type: "text/x-python" });

    const result = await addFile(file, false);

    expect(result.success).toBe(true);
    expect(error.value).toBeNull();
    expect(attachments.value).toHaveLength(1);
    const [attachment] = attachments.value;
    expect(attachment.type).toBe("text");
    expect(attachment.filename).toBe("script.py");
    expect(decodeTextDataUrl(attachment.dataUrl)).toBe("print('hi')\n");
  });

  it("attaches a text file whose MIME type the browser left empty", async () => {
    const { addFile, attachments } = useAttachments();
    const result = await addFile(new File(["a: 1\n"], "config.yaml", { type: "" }), false);

    expect(result.success).toBe(true);
    expect(attachments.value[0].type).toBe("text");
  });

  it("still rejects unsupported binary files and names text files in the hint", async () => {
    const { addFile, attachments, error } = useAttachments();
    const result = await addFile(new File([new Uint8Array([1, 2, 3])], "archive.zip", { type: "application/zip" }), true);

    expect(result.success).toBe(false);
    expect(attachments.value).toHaveLength(0);
    expect(error.value).toMatch(/text/i);
  });
});

function bytesDataUrl(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:text/plain;base64,${btoa(binary)}`;
}

function utf16(text, { littleEndian, bom }) {
  const bytes = bom ? (littleEndian ? [0xff, 0xfe] : [0xfe, 0xff]) : [];
  for (const char of text) {
    const code = char.charCodeAt(0);
    bytes.push(...(littleEndian ? [code & 0xff, code >> 8] : [code >> 8, code & 0xff]));
  }
  return bytes;
}

describe("decodeTextDataUrl encodings", () => {
  const text = "name\tvalue\ncafé\t42\n";

  it("reads UTF-16 with a byte-order mark", () => {
    expect(decodeTextDataUrl(bytesDataUrl(utf16(text, { littleEndian: true, bom: true })))).toBe(text);
    expect(decodeTextDataUrl(bytesDataUrl(utf16(text, { littleEndian: false, bom: true })))).toBe(text);
  });

  it("reads UTF-16 without a byte-order mark", () => {
    expect(decodeTextDataUrl(bytesDataUrl(utf16(text, { littleEndian: true, bom: false })))).toBe(text);
    expect(decodeTextDataUrl(bytesDataUrl(utf16(text, { littleEndian: false, bom: false })))).toBe(text);
  });

  it("drops a UTF-8 byte-order mark", () => {
    expect(decodeTextDataUrl(bytesDataUrl([0xef, 0xbb, 0xbf, 0x68, 0x69]))).toBe("hi");
  });
});

describe("context compression with text attachments", () => {
  const message = {
    role: "user",
    content: "Summarise this",
    attachments: [{ id: "1", type: "text", filename: "notes.txt", dataUrl: textDataUrl("the quarterly notes ".repeat(200)) }],
  };

  it("counts the file text towards the token estimate", () => {
    const withoutFile = estimateMessageTokens({ ...message, attachments: [] });
    expect(estimateMessageTokens(message)).toBeGreaterThan(withoutFile + 500);
  });

  it("does not count image or PDF data as text", () => {
    const image = { role: "user", content: "hi", attachments: [{ type: "image", filename: "a.png", dataUrl: "data:image/png;base64," + "A".repeat(50_000) }] };
    expect(estimateMessageTokens(image)).toBeLessThan(100);
  });

  it("gives the summariser the file text", () => {
    const prompt = formatMessageForSummaryPrompt(message);
    expect(prompt).toContain("Summarise this");
    expect(prompt).toContain("notes.txt");
    expect(prompt).toContain("the quarterly notes");
  });
});

describe("summary prompt with several large text attachments", () => {
  it("includes every file, not just the first 8,000 characters", () => {
    const message = {
      role: "user",
      content: "Review these",
      attachments: [
        { type: "text", filename: "script.py", dataUrl: textDataUrl("x = 1\n".repeat(1750) + "SCRIPT_END") },
        { type: "text", filename: "config.toml", dataUrl: textDataUrl("CONFIG_MARKER = true") },
      ],
    };
    const prompt = formatMessageForSummaryPrompt(message);
    expect(prompt).toContain("SCRIPT_END");
    expect(prompt).toContain("config.toml");
    expect(prompt).toContain("CONFIG_MARKER");
  });
});
