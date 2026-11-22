/**
 * True while a key press belongs to an input method (Japanese, Chinese,
 * Korean and others), where Enter picks a candidate rather than submitting.
 * Safari reports the confirming Enter with keyCode 229 after composition has
 * already ended, hence the second check.
 *
 * @param {KeyboardEvent} event
 * @returns {boolean}
 */
export function isImeKey(event) {
  return !!event && (event.isComposing === true || event.keyCode === 229);
}
