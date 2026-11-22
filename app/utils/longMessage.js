/**
 * @file longMessage.js
 * @description Decides when a sent message is long enough to show collapsed.
 */

/** Lines shown while a long message is collapsed. */
export const COLLAPSED_LINES = 12;

// Roughly what fits on one line of the user bubble.
const CHARS_PER_LINE = 70;
// Collapsing must hide a worthwhile amount, not just a line or two.
const MIN_HIDDEN_LINES = 4;

/**
 * Estimates how many lines a message takes in the user bubble, counting
 * both its own line breaks and wrapping of long lines.
 * @param {string} text
 * @returns {number}
 */
export function estimateLines(text) {
  if (typeof text !== "string" || !text) return 0;
  return text
    .split("\n")
    .reduce((total, line) => total + Math.max(1, Math.ceil(line.length / CHARS_PER_LINE)), 0);
}

/**
 * @param {string} text
 * @returns {boolean} Whether the message is shown collapsed by default.
 */
export function isLongMessage(text) {
  return estimateLines(text) >= COLLAPSED_LINES + MIN_HIDDEN_LINES;
}
