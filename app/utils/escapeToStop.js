import { isTextEntryTarget } from "./keybinds";

// Anything open that Escape should close first. Plain role="dialog" is not
// listed: the workspace dock carries it while docked beside the chat.
const OVERLAYS =
  '[aria-modal="true"], [role="alertdialog"], [role="menu"], [role="listbox"], [data-reka-popper-content-wrapper]';

function isShown(element) {
  return typeof element.checkVisibility !== "function" || element.checkVisibility();
}

/**
 * Whether an Escape keydown should stop the reply being generated.
 * Meant for a capture-phase listener, so overlays are still in the page
 * when it runs.
 *
 * @param {KeyboardEvent} event
 * @param {Element|null} [composer] The composer textarea; Escape typed there
 *   still counts, unlike in other text fields.
 * @param {Document} [doc]
 * @returns {boolean}
 */
export function shouldStopOnEscape(event, composer = null, doc = document) {
  if (event.key !== "Escape" || event.defaultPrevented || event.isComposing) return false;
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return false;
  if (event.target !== composer && isTextEntryTarget(event.target)) return false;
  return !Array.from(doc.querySelectorAll(OVERLAYS)).some(isShown);
}
