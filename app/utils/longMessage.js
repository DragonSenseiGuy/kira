/**
 * @file longMessage.js
 * @description Decides when a sent message is long enough to show collapsed.
 */

/** Lines shown while a long message is collapsed. */
export const COLLAPSED_LINES = 12;

// Collapsing must hide a worthwhile amount, not just a line or two.
const MIN_HIDDEN_LINES = 4;

/**
 * @param {number} contentHeight Height of the full text as laid out, in px.
 * @param {number} lineHeight Height of one line of that text, in px.
 * @returns {boolean} Whether the message is shown collapsed by default.
 */
export function isLongMessage(contentHeight, lineHeight) {
  if (!(contentHeight > 0) || !(lineHeight > 0)) return false;
  // Half a line of slack absorbs sub-pixel rounding.
  return contentHeight >= lineHeight * (COLLAPSED_LINES + MIN_HIDDEN_LINES - 0.5);
}
