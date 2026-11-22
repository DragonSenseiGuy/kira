// scrollWidth and clientWidth are whole pixels, so text that overflows by
// less than one can look as if it fits; measuring the text itself does not.
function isClipped(element) {
  if (element.scrollWidth > element.clientWidth) return true;
  const range = element.ownerDocument.createRange();
  range.selectNodeContents(element);
  return range.getBoundingClientRect?.().width > element.getBoundingClientRect().width;
}

/**
 * Gives an element a hover tooltip with its full text, but only while the
 * text is cut off with an ellipsis; a tooltip repeating visible text is noise.
 *
 * @param {HTMLElement} element - The element whose text may be clipped.
 * @param {string} text - The full text.
 */
export function showTitleWhenClipped(element, text) {
  if (!element) return;
  if (isClipped(element)) element.title = text ?? "";
  else element.removeAttribute("title");
}
