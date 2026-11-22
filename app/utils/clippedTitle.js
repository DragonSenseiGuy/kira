/**
 * Gives an element a hover tooltip with its full text, but only while the
 * text is cut off with an ellipsis; a tooltip repeating visible text is noise.
 *
 * @param {HTMLElement} element - The element whose text may be clipped.
 * @param {string} text - The full text.
 */
export function showTitleWhenClipped(element, text) {
  if (!element) return;
  if (element.scrollWidth > element.clientWidth) element.title = text ?? "";
  else element.removeAttribute("title");
}
