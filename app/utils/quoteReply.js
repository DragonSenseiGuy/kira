/**
 * @file quoteReply.js
 * @description Turns selected message text into a Markdown quote in the draft.
 */

/** Longest selection that is quoted; longer ones are cut with an ellipsis. */
export const MAX_QUOTE_LENGTH = 2000;

/**
 * @param {string} selection  Text the user selected in a message.
 * @returns {string} A Markdown blockquote, or "" when nothing usable is selected.
 */
export function formatQuote(selection) {
  if (typeof selection !== "string") return "";
  let text = selection.replace(/\r\n?/g, "\n").trim();
  if (!text) return "";
  if (text.length > MAX_QUOTE_LENGTH) text = `${text.slice(0, MAX_QUOTE_LENGTH).trimEnd()}…`;
  return text
    .split("\n")
    .map((line) => (line.trim() ? `> ${line.trimEnd()}` : ">"))
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

/**
 * The selected text if the whole selection lies inside one assistant
 * message's rendered content, otherwise "".
 *
 * @param {Selection|null} selection
 * @returns {string}
 */
export function quotableSelection(selection) {
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return "";
  const contentOf = (node) => {
    const element = node?.nodeType === 1 ? node : node?.parentElement;
    return element?.closest?.(".message.assistant .markdown-content") || null;
  };
  const start = contentOf(selection.anchorNode);
  const end = contentOf(selection.focusNode);
  if (!start || !end) return "";
  if (start.closest(".message") !== end.closest(".message")) return "";
  return selection.toString().trim();
}
