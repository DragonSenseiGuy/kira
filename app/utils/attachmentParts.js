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
 * Decodes the UTF-8 text held in a base64 data URL.
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
    return new TextDecoder().decode(bytes);
  } catch {
    return "";
  }
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
      const text = formatAttachedFiles([
        { path: attachment.filename || "file.txt", content: decodeTextDataUrl(attachment.dataUrl) },
      ]);
      if (text) parts.push({ type: "text", text });
    }
  }
  return parts;
}
