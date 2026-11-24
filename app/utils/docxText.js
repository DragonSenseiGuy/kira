/**
 * @file docxText.js
 * @description Extracts the text of a Word (.docx) document so it can be
 * attached like a text file: models cannot read the zipped XML itself.
 */

import { unzipSync, strFromU8 } from "fflate";

export const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// Uncompressed size cap per XML part, checked before inflating, so a
// zip bomb cannot exhaust the tab's memory.
export const MAX_DOCX_PART_BYTES = 32 * 1024 * 1024;

const PARTS = ["word/document.xml", "word/footnotes.xml", "word/endnotes.xml"];

/**
 * @param {{name?: string, type?: string}} file  A File, or anything shaped like one.
 * @returns {boolean}
 */
export function isDocxFile(file) {
  const type = String(file?.type || "").toLowerCase().split(";")[0];
  if (type === DOCX_MIME_TYPE) return true;
  return /\.docx$/i.test(String(file?.name || ""));
}

function paragraphPrefix(paragraph) {
  const properties = childrenNamed(paragraph, "pPr")[0];
  if (!properties) return "";
  const styleElement = childrenNamed(properties, "pStyle")[0];
  const style = (styleElement && attr(styleElement, "val")) || "";
  const heading = /^heading\s*([1-6])$/i.exec(style);
  if (heading) return `${"#".repeat(Number(heading[1]))} `;
  if (/^title$/i.test(style)) return "# ";
  if (childrenNamed(properties, "numPr").length || /^list/i.test(style)) return "- ";
  return "";
}

// Looked up by local name so any namespace prefix (and Strict OOXML) works.
function attr(element, localName) {
  for (const attribute of element.attributes) {
    if (attribute.localName === localName) return attribute.value;
  }
  return null;
}

function firstDescendant(node, localName) {
  for (const element of node.getElementsByTagName("*")) {
    if (element.localName === localName) return element;
  }
  return null;
}

function childrenNamed(node, localName) {
  return Array.from(node.children).filter((child) => child.localName === localName);
}

const SKIPPED = new Set(["pPr", "rPr", "sectPr", "tblPr", "tblGrid", "trPr", "tcPr", "delText", "instrText", "delInstrText", "sdtPr", "sdtEndPr"]);

function inlineText(node) {
  let out = "";
  for (const child of node.children) {
    const name = child.localName;
    if (SKIPPED.has(name)) continue;
    // w:t is document text; m:t is the text of an Office Math equation.
    if (name === "t") out += child.textContent;
    else if (name === "tab") out += "\t";
    else if (name === "br" || name === "cr") out += "\n";
    else if (name === "noBreakHyphen") out += "-";
    else if (name === "footnoteReference") out += `[^${attr(child, "id")}]`;
    else if (name === "endnoteReference") out += `[^e${attr(child, "id")}]`;
    // Text boxes nest whole paragraphs and tables inside a run.
    else if (name === "p" || name === "tbl") out += `\n${blockLines(child).join("\n")}\n`;
    else out += inlineText(child);
  }
  return out;
}

const WRAPPERS = new Set(["sdt", "sdtContent", "customXml"]);

// Rows and cells can sit inside content controls (w:sdt) or custom XML.
function childrenThroughWrappers(node, localName, found = []) {
  for (const child of node.children) {
    if (child.localName === localName) found.push(child);
    else if (WRAPPERS.has(child.localName)) childrenThroughWrappers(child, localName, found);
  }
  return found;
}

function tableRows(table) {
  const rows = [];
  for (const row of childrenThroughWrappers(table, "tr")) {
    const cells = childrenThroughWrappers(row, "tc").map((cell) =>
      blockLines(cell).join(" ").replace(/\s+/g, " ").trim(),
    );
    rows.push(cells.join("\t"));
  }
  return rows;
}

/**
 * @param {Element} node  A container of paragraphs and tables (body, cell, note).
 * @param {string[]} [lines]
 * @returns {string[]}
 */
function blockLines(node, lines = []) {
  if (node.localName === "p") {
    lines.push(paragraphPrefix(node) + inlineText(node));
    return lines;
  }
  if (node.localName === "tbl") {
    lines.push(...tableRows(node));
    return lines;
  }
  for (const child of node.children) {
    if (!SKIPPED.has(child.localName)) blockLines(child, lines);
  }
  return lines;
}

function parseXml(xml) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("Malformed document XML");
  return doc;
}

// Tabs are left alone: empty table cells at the edge of a row are tabs.
function tidy(text) {
  return text.replace(/ +\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/^\s*\n/, "").replace(/\n\s*$/, "").replace(/^ +| +$/g, "");
}

/**
 * Converts WordprocessingML (`word/document.xml`) to plain text. Headings
 * and list items get Markdown markers; table cells are tab-separated, one
 * row per line.
 *
 * @param {string} xml
 * @returns {string}
 * @throws {Error} When the XML is malformed.
 */
export function documentXmlToText(xml) {
  const body = firstDescendant(parseXml(xml), "body");
  return body ? tidy(blockLines(body).join("\n")) : "";
}

/**
 * Footnotes or endnotes (`word/footnotes.xml`, `word/endnotes.xml`) as
 * `[^id]: text` lines, matching the references left in the body.
 *
 * @param {string} xml
 * @param {"footnote"|"endnote"} kind
 * @returns {string}
 */
export function notesXmlToText(xml, kind) {
  const label = kind === "endnote" ? "e" : "";
  const lines = [];
  const root = parseXml(xml).documentElement;
  for (const note of childrenNamed(root, kind)) {
    // Separator "notes" only hold the line drawn above the notes.
    const type = attr(note, "type");
    if (type && type !== "normal") continue;
    const text = tidy(blockLines(note).join(" "));
    if (text) lines.push(`[^${label}${attr(note, "id")}]: ${text}`);
  }
  return lines.join("\n");
}

/**
 * @param {ArrayBuffer|Uint8Array} data  The bytes of a .docx file.
 * @returns {string} The document's text, followed by its notes.
 * @throws {Error} When the data is not a readable Word document.
 */
export function extractDocxText(data) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let files;
  try {
    files = unzipSync(bytes, {
      filter: (file) => {
        if (!PARTS.includes(file.name)) return false;
        if (file.originalSize > MAX_DOCX_PART_BYTES) throw new Error("Document too large");
        return true;
      },
    });
  } catch {
    throw new Error("Not a valid .docx file");
  }
  const documentXml = files["word/document.xml"];
  if (!documentXml) throw new Error("Not a valid .docx file");

  const sections = [documentXmlToText(strFromU8(documentXml))];
  if (files["word/footnotes.xml"]) sections.push(notesXmlToText(strFromU8(files["word/footnotes.xml"]), "footnote"));
  if (files["word/endnotes.xml"]) sections.push(notesXmlToText(strFromU8(files["word/endnotes.xml"]), "endnote"));
  return sections.filter(Boolean).join("\n\n");
}
