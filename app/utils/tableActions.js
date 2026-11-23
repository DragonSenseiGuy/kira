/**
 * @file tableActions.js
 * @description Copy and download actions for tables rendered in a reply.
 */

import { trustedHandler } from "./sanitizeHtml";

const COPY_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M9 18q-.825 0-1.412-.587T7 16V4q0-.825.588-1.412T9 2h9q.825 0 1.413.588T20 4v12q0 .825-.587 1.413T18 18zm0-2h9V4H9zm-4 6q-.825 0-1.412-.587T3 20V7q0-.425.288-.712T4 6t.713.288T5 7v13h10q.425 0 .713.288T16 21t-.288.713T15 22zm4-6V4z" /></svg>';
const DOWNLOAD_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M12 15.575q-.2 0-.375-.062T11.3 15.3l-3.6-3.6q-.3-.3-.288-.7t.288-.7q.3-.3.713-.312t.712.287L11 12.15V5q0-.425.288-.712T12 4t.713.288T13 5v7.15l1.875-1.875q.3-.3.713-.288t.712.313q.275.3.288.7t-.288.7l-3.6 3.6q-.15.15-.325.213t-.375.062M6 20q-.825 0-1.412-.587T4 18v-2q0-.425.288-.712T5 15t.713.288T6 16v2h12v-2q0-.425.288-.712T19 15t.713.288T20 16v2q0 .825-.587 1.413T18 20z" /></svg>';

/**
 * Wraps every Markdown table with a small action row.
 * @param {import('markdown-it')} md
 */
export function addTableActions(md) {
  md.renderer.rules.table_open = (tokens, idx, options, env, self) =>
    `<div class="table-wrapper">${self.renderToken(tokens, idx, options)}`;
  md.renderer.rules.table_close = (tokens, idx, options, env, self) =>
    `${self.renderToken(tokens, idx, options)}<div class="table-actions">` +
    `<button type="button" class="table-action-button" ${trustedHandler("window.copyTable(event.currentTarget)")} title="Copy table">${COPY_ICON}<span>Copy table</span></button>` +
    `<button type="button" class="table-action-button" ${trustedHandler("window.downloadTable(event.currentTarget)")} title="Download as CSV">${DOWNLOAD_ICON}<span>CSV</span></button>` +
    `</div></div>\n`;
}

function cellText(cell) {
  const copy = cell.cloneNode(true);
  // KaTeX renders an equation three times (visual, MathML, source); keep the source.
  copy.querySelectorAll(".katex").forEach((math) => {
    const source = math.querySelector('annotation[encoding="application/x-tex"]');
    if (source) math.replaceWith(source.textContent || "");
  });
  copy.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
  return (copy.textContent || "")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .join("\n")
    .trim();
}

/**
 * Reads a table element into rows of cell text. A `<br>` in a cell becomes
 * a line break.
 * @param {HTMLTableElement} table
 * @returns {string[][]}
 */
export function tableRows(table) {
  if (!table) return [];
  return Array.from(table.querySelectorAll("tr")).map((row) =>
    Array.from(row.querySelectorAll("th, td")).map(cellText),
  );
}

// A spreadsheet runs a cell that starts with one of these as a formula.
const FORMULA_START = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?%?$/i;

/** Prefixes text a spreadsheet would run as a formula so it opens as text. */
function asText(cell) {
  return FORMULA_START.test(cell) && !PLAIN_NUMBER.test(cell) ? `'${cell}` : cell;
}

/**
 * Tab-separated text: pastes as cells into a spreadsheet and stays readable
 * as plain text. Each cell stays on one line.
 * @param {string[][]} rows
 * @returns {string}
 */
export function rowsToTsv(rows) {
  return rows.map((row) => row.map((cell) => asText(cell.replace(/[\t\n\r]+/g, " "))).join("\t")).join("\n");
}

function csvCell(value) {
  const cell = asText(value);
  // An empty field is quoted so a row of one empty cell is still a row.
  return cell === "" || /[",\n\r]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

/**
 * RFC 4180 CSV.
 * @param {string[][]} rows
 * @returns {string}
 */
export function rowsToCsv(rows) {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

const escapeHtml = (text) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const RICH_TAGS = new Set(["A", "IMG", "STRONG", "B", "EM", "I", "CODE", "DEL", "S", "SUB", "SUP", "BR"]);
const SAFE_LINK = /^(?:https?:|mailto:)/i;
const SAFE_IMAGE = /^(?:https?:|data:image\/(?:png|jpeg|gif|webp);)/i;

/** An attribute's URL made absolute, as the pasted copy has no base to resolve it against. */
function absoluteUrl(element, name) {
  const value = (element.getAttribute(name) || "").trim();
  if (!value) return "";
  try {
    return new URL(value, element.baseURI).href;
  } catch {
    return "";
  }
}

/** The text a piece of rebuilt markup shows, read without loading anything in it. */
function shownText(html) {
  if (typeof DOMParser === "undefined") return "";
  const body = new DOMParser().parseFromString(html, "text/html").body;
  if (!body) return "";
  body.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
  return (body.textContent || "").trim();
}

/** Rebuilds a rendered cell's content from a small set of tags and attributes. */
function richHtml(node) {
  let html = "";
  for (const child of node.childNodes) {
    if (child.nodeType === 3) {
      html += escapeHtml(child.textContent || "");
      continue;
    }
    if (child.nodeType !== 1 || /^(?:SCRIPT|STYLE|TEMPLATE)$/.test(child.tagName)) continue;
    if (child.classList?.contains("katex")) {
      const source = child.querySelector('annotation[encoding="application/x-tex"]');
      html += escapeHtml(source?.textContent || child.textContent || "");
      continue;
    }
    const tag = child.tagName;
    if (!RICH_TAGS.has(tag)) {
      html += richHtml(child);
    } else if (tag === "BR") {
      html += "<br>";
    } else if (tag === "IMG") {
      const src = absoluteUrl(child, "src");
      const alt = escapeHtml(child.getAttribute("alt") || "");
      html += SAFE_IMAGE.test(src) ? `<img src="${escapeHtml(src)}" alt="${alt}">` : alt;
    } else if (tag === "A") {
      // A link to a place in this reply (a footnote) has no target once pasted.
      const href = (child.getAttribute("href") || "").trim().startsWith("#") ? "" : absoluteUrl(child, "href");
      const label = richHtml(child);
      html += SAFE_LINK.test(href) ? `<a href="${escapeHtml(href)}">${label}</a>` : label;
    } else {
      const name = tag.toLowerCase();
      html += `<${name}>${richHtml(child)}</${name}>`;
    }
  }
  return html;
}

/**
 * HTML table for the rich clipboard format. Links, images and basic
 * formatting are kept from an allowlist; a cell a spreadsheet would run as
 * a formula is written as prefixed plain text instead.
 * @param {HTMLTableElement} table
 * @returns {string}
 */
export function safeTableHtml(table) {
  if (!table) return "";
  const body = Array.from(table.querySelectorAll("tr"))
    .map((row) => {
      const cells = Array.from(row.querySelectorAll("th, td")).map((cell) => {
        const tag = cell.tagName.toLowerCase();
        const text = cellText(cell);
        const guarded = asText(text);
        let content = guarded !== text ? escapeHtml(guarded).replace(/\n/g, "<br>") : richHtml(cell).trim();
        // The rebuilt markup can show text the plain cell does not, such as
        // the alt text standing in for a rejected image.
        const shown = shownText(content);
        if (guarded === text && asText(shown) !== shown) content = escapeHtml(asText(shown)).replace(/\n/g, "<br>");
        return `<${tag}>${content}</${tag}>`;
      });
      return `<tr>${cells.join("")}</tr>`;
    })
    .join("");
  return `<table>${body}</table>`;
}

function tableFor(button) {
  return button?.closest?.(".table-wrapper")?.querySelector("table") || null;
}

function flash(button, label) {
  const text = button.querySelector("span");
  if (!text) return;
  const original = text.dataset.label || text.textContent;
  text.dataset.label = original;
  text.textContent = label;
  button.classList.add("copied");
  setTimeout(() => {
    text.textContent = original;
    button.classList.remove("copied");
  }, 2000);
}

export async function copyTable(button) {
  const table = tableFor(button);
  if (!table) return;
  const rows = tableRows(table);
  const text = rowsToTsv(rows);
  try {
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard.write) {
      // Rich copy keeps the table a table in documents and mail.
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": new Blob([text], { type: "text/plain" }),
          "text/html": new Blob([safeTableHtml(table)], { type: "text/html" }),
        }),
      ]);
    } else {
      await navigator.clipboard.writeText(text);
    }
    flash(button, "Copied!");
  } catch {
    try {
      await navigator.clipboard.writeText(text);
      flash(button, "Copied!");
    } catch (err) {
      console.error("Failed to copy table:", err);
    }
  }
}

export function downloadTable(button) {
  const table = tableFor(button);
  if (!table) return;
  // The BOM makes Excel read the file as UTF-8.
  const blob = new Blob(["\uFEFF", rowsToCsv(tableRows(table))], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `table-${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

if (typeof window !== "undefined") {
  window.copyTable = copyTable;
  window.downloadTable = downloadTable;
}
