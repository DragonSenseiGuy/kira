/**
 * @file quoteReply.js
 * @description Turns selected message text into a Markdown quote in the draft.
 */

/** Longest selection that is quoted; longer ones are cut with an ellipsis. */
export const MAX_QUOTE_LENGTH = 2000;

/** Selection text without surrounding blank lines; indentation is kept. */
function trimBlankLines(text) {
  return text.replace(/\r\n?/g, "\n").replace(/^(?:[ \t]*\n)+/, "").replace(/\s+$/, "");
}

/**
 * @param {string} selection  Text the user selected in a message.
 * @returns {string} A Markdown blockquote, or "" when nothing usable is selected.
 */
export function formatQuote(selection) {
  if (typeof selection !== "string" || !selection.trim()) return "";
  let text = trimBlankLines(selection);
  if (text.length > MAX_QUOTE_LENGTH) text = `${text.slice(0, MAX_QUOTE_LENGTH).trimEnd()}…`;
  return text
    .split("\n")
    // A quoted "@path" must stay text: unescaped it would become a file
    // mention and attach that workspace file when the message is sent.
    .map((line) => line.trimEnd().replace(/(^|\s)@(?=\w)/g, "$1\\@"))
    .map((line) => (line ? `> ${line}` : ">"))
    .join("\n");
}

/**
 * Adds a quote to the draft: after any quotes and text already there, with
 * a blank line on both sides so the reply is typed below it.
 *
 * @param {string} draft      Current composer text.
 * @param {string} selection  Text the user selected in a message.
 * @returns {string} The new composer text (unchanged when nothing is quoted).
 */
export function insertQuote(draft, selection) {
  const quote = formatQuote(selection);
  const current = typeof draft === "string" ? draft : "";
  if (!quote) return current;
  const before = current.trimEnd();
  return `${before ? `${before}\n\n` : ""}${quote}\n\n`;
}

const QUOTABLE_SELECTOR = ".message.assistant .part-content .markdown-content:not(.reasoning-content)";

/**
 * The selected text if the whole selection lies inside one answer block of
 * an assistant message (not its reasoning or tool cards), otherwise "".
 *
 * @param {Selection|null} selection
 * @returns {string}
 */
export function quotableSelection(selection) {
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return "";
  const answerBlockOf = (node) => {
    const element = node?.nodeType === 1 ? node : node?.parentElement;
    return element?.closest?.(QUOTABLE_SELECTOR) || null;
  };
  const start = answerBlockOf(selection.anchorNode);
  // One block only: a selection running from one answer block into the
  // next would also pick up the tool cards rendered between them.
  if (!start || start !== answerBlockOf(selection.focusNode)) return "";
  const text = selection.toString();
  return text.trim() ? text : "";
}

/** Height reserved for the button, including the gap to the selection. */
const BUTTON_SPACE = 40;
const EDGE_GAP = 8;

/**
 * Where to put the Quote button (viewport coordinates): above the selection
 * when it fits inside the visible chat area, otherwise below it, and always
 * inside that area so the toolbar and composer never cover it.
 *
 * @param {{top: number, bottom: number, left: number, width: number}} selectionRect
 * @param {{top: number, bottom: number, left: number, right: number}} area  Visible chat area.
 * @returns {{top: number, left: number}}
 */
export function quoteButtonPosition(selectionRect, area) {
  const minTop = area.top + EDGE_GAP;
  const maxTop = Math.max(minTop, area.bottom - BUTTON_SPACE);
  let top = selectionRect.top - BUTTON_SPACE;
  if (top < minTop) top = selectionRect.bottom + EDGE_GAP;
  top = Math.min(Math.max(top, minTop), maxTop);
  const center = selectionRect.left + selectionRect.width / 2;
  const left = Math.min(Math.max(center, area.left + 48), Math.max(area.left + 48, area.right - 48));
  return { top, left };
}
