/**
 * @file attachmentParts.js
 * @description Converts stored message attachments into OpenAI-compatible
 * content parts, and recognises text/code files.
 *
 * Every attachment is stored as `{ id, type, filename, dataUrl, mimeType }`.
 * Text files are decoded and sent as an `<attached_file>` text block, so
 * they work with any model.
 */

import { formatAttachedFiles } from "./mentions";

const TEXT_MIME_TYPES = new Set([
  "application/json",
  "application/xml",
  "application/javascript",
  "application/x-javascript",
  "application/typescript",
  "application/x-yaml",
  "application/yaml",
  "application/toml",
  "application/sql",
  "application/x-sh",
  "application/x-httpd-php",
]);

export const TEXT_FILE_EXTENSIONS = [
  "txt", "md", "markdown", "csv", "tsv", "log", "json", "jsonl", "xml", "yaml", "yml", "toml", "ini", "cfg", "conf", "env",
  "html", "htm", "css", "scss", "less", "js", "mjs", "cjs", "jsx", "ts", "tsx", "vue", "svelte",
  "py", "rb", "php", "java", "kt", "swift", "c", "h", "cpp", "hpp", "cs", "go", "rs", "lua", "r", "pl", "dart",
  "sh", "bash", "zsh", "ps1", "bat", "sql", "graphql", "proto", "tex", "rst", "diff", "patch", "srt", "vtt",
];

function extensionOf(name) {
  const match = /\.([^.]+)$/.exec(String(name || ""));
  return match ? match[1].toLowerCase() : "";
}

/**
 * @param {{name?: string, type?: string}} file  A File, or anything shaped like one.
 * @returns {boolean} True when the file can be attached as plain text.
 */
export function isTextFile(file) {
  const type = String(file?.type || "").toLowerCase().split(";")[0];
  if (type.startsWith("text/") || TEXT_MIME_TYPES.has(type)) return true;
  // Browsers often report no (or a generic) type for source files.
  if (type && type !== "application/octet-stream") return false;
  return TEXT_FILE_EXTENSIONS.includes(extensionOf(file?.name));
}

/**
 * Windows tools (Excel "Unicode text", PowerShell redirects) write UTF-16.
 * Recognised by its byte-order mark, or without one by the NUL bytes that
 * ASCII characters leave in every other position.
 *
 * @param {Uint8Array} bytes
 * @returns {"utf-8"|"utf-16le"|"utf-16be"}
 */
export function detectTextEncoding(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return "utf-16le";
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return "utf-16be";

  const sample = Math.min(bytes.length - (bytes.length % 2), 2048);
  if (sample < 4) return "utf-8";
  let evenNuls = 0;
  let oddNuls = 0;
  for (let i = 0; i < sample; i += 2) {
    if (bytes[i] === 0) evenNuls++;
    if (bytes[i + 1] === 0) oddNuls++;
  }
  const pairs = sample / 2;
  if (oddNuls > pairs * 0.4 && evenNuls < pairs * 0.1) return "utf-16le";
  if (evenNuls > pairs * 0.4 && oddNuls < pairs * 0.1) return "utf-16be";
  return "utf-8";
}

/**
 * Decodes the text (UTF-8 or UTF-16) held in a base64 data URL.
 *
 * @param {string} dataUrl
 * @returns {string} The text, or "" when it cannot be decoded.
 */
export function decodeTextDataUrl(dataUrl) {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) return "";
  const comma = dataUrl.indexOf(",");
  if (comma === -1) return "";
  try {
    const binary = atob(dataUrl.slice(comma + 1));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    // TextDecoder drops the byte-order mark of the encoding it is given.
    return new TextDecoder(detectTextEncoding(bytes)).decode(bytes);
  } catch {
    return "";
  }
}

/**
 * The text-file attachments of a message as `<attached_file>` blocks: what
 * the model is sent for them. Images and PDFs are not included.
 *
 * @param {Array<Object>} attachments  Stored attachments of a user message.
 * @returns {string} The blocks, or "" when there are no text attachments.
 */
export function textAttachmentsToText(attachments) {
  return (attachments || [])
    .filter((attachment) => attachment?.type === "text")
    .map(textAttachmentBlock)
    .filter(Boolean)
    .join("\n\n");
}

// Decoding a multi-megabyte data URL is not free and history is re-formatted
// (and its size re-estimated) on every turn, so blocks are kept per attachment.
const blockCache = new WeakMap();

function textAttachmentBlock(attachment) {
  const cached = blockCache.get(attachment);
  if (cached && cached.dataUrl === attachment.dataUrl && cached.filename === attachment.filename) {
    return cached.block;
  }
  const block = formatAttachedFiles([
    { path: attachment.filename || "file.txt", content: decodeTextDataUrl(attachment.dataUrl) },
  ]);
  blockCache.set(attachment, { dataUrl: attachment.dataUrl, filename: attachment.filename, block });
  return block;
}

/**
 * @param {Array<Object>} attachments  Stored attachments of a user message.
 * @returns {Array<Object>} Content parts to append after the message text.
 */
export function attachmentsToContentParts(attachments) {
  const parts = [];
  for (const attachment of attachments || []) {
    if (attachment.type === "image") {
      parts.push({ type: "image_url", image_url: { url: attachment.dataUrl } });
    } else if (attachment.type === "pdf") {
      parts.push({
        type: "file",
        file: { filename: attachment.filename, file_data: attachment.dataUrl },
      });
    } else if (attachment.type === "text") {
      const text = textAttachmentsToText([attachment]);
      if (text) parts.push({ type: "text", text });
    }
  }
  return parts;
}
