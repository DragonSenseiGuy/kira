/**
 * @file docxText.js
 * @description Extracts the text of a Word (.docx) document so it can be
 * attached like a text file: models cannot read the zipped XML itself.
 */

import { unzipSync, strFromU8 } from "fflate";

export const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * @param {{name?: string, type?: string}} file  A File, or anything shaped like one.
 * @returns {boolean}
 */
export function isDocxFile(file) {
  const type = String(file?.type || "").toLowerCase().split(";")[0];
  if (type === DOCX_MIME_TYPE) return true;
  return /\.docx$/i.test(String(file?.name || ""));
}

const ENTITIES = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

function decodeXmlEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] === "#") {
      const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      try {
        return String.fromCodePoint(code);
      } catch {
        return match;
      }
    }
    return ENTITIES[entity.toLowerCase()] ?? match;
  });
}

function paragraphPrefix(properties) {
  const style = /<w:pStyle\s+w:val="([^"]*)"/.exec(properties)?.[1] || "";
  const heading = /^heading\s*([1-6])$/i.exec(style);
  if (heading) return `${"#".repeat(Number(heading[1]))} `;
  if (/^title$/i.test(style)) return "# ";
  if (/<w:numPr\b/.test(properties) || /^list/i.test(style)) return "- ";
  return "";
}

// Paragraph properties are matched whole so the tab stops they define are
// not mistaken for tab characters.
const TOKEN = /<w:pPr>([\s\S]*?)<\/w:pPr>|<w:p\/>|<w:p[\s>]|<\/w:p>|<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/>|<w:(?:br|cr)\b[^>]*\/>|<\/w:tc>|<\/w:tr>/g;

/**
 * Converts WordprocessingML (`word/document.xml`) to plain text. Headings
 * and list items get Markdown markers; table cells are tab-separated.
 *
 * @param {string} xml
 * @returns {string}
 */
export function documentXmlToText(xml) {
  let out = "";
  for (const match of String(xml || "").matchAll(TOKEN)) {
    const token = match[0];
    if (match[1] !== undefined) out += paragraphPrefix(match[1]);
    else if (match[2] !== undefined) out += decodeXmlEntities(match[2]);
    else if (token === "<w:p/>" || token === "</w:p>") out += "\n";
    else if (token.startsWith("<w:tab")) out += "\t";
    else if (token.startsWith("<w:br") || token.startsWith("<w:cr")) out += "\n";
    else if (token === "</w:tc>") out = out.replace(/\n?$/, "\t");
    else if (token === "</w:tr>") out = out.replace(/\t?$/, "\n");
  }
  return out.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * @param {ArrayBuffer|Uint8Array} data  The bytes of a .docx file.
 * @returns {string} The document's text.
 * @throws {Error} When the data is not a Word document.
 */
export function extractDocxText(data) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let files;
  try {
    files = unzipSync(bytes, { filter: (file) => file.name === "word/document.xml" });
  } catch {
    throw new Error("Not a valid .docx file");
  }
  const xml = files["word/document.xml"];
  if (!xml) throw new Error("Not a valid .docx file");
  return documentXmlToText(strFromU8(xml));
}
