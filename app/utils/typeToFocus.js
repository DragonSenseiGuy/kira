import { isTextEntryTarget } from "./keybinds";

// Open overlays handle their own keys (menus use type-ahead, modal dialogs own
// focus). Plain role="dialog" is not enough: the workspace dock carries it
// while docked beside the chat.
const OVERLAYS = '[aria-modal="true"], [role="alertdialog"], [role="menu"], [role="listbox"]';

const POPOVER = "[data-reka-popper-content-wrapper]";

function isShown(element) {
  return typeof element.checkVisibility !== "function" || element.checkVisibility();
}

/**
 * Whether a keydown outside any text field should move focus to the
 * composer, so the character being typed lands there.
 *
 * @param {KeyboardEvent} event
 * @param {Document} [doc]
 * @param {Element|null} [composerRoot] The composer's own element; its
 *   suggestion list is not an overlay to wait for.
 * @returns {boolean}
 */
export function shouldFocusComposerOnKey(event, doc = document, composerRoot = null) {
  if (event.defaultPrevented || event.isComposing) return false;
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  // Printable characters only; Space is left alone because it activates a
  // focused button and scrolls the page.
  if (typeof event.key !== "string" || Array.from(event.key).length !== 1 || event.key === " ") return false;
  if (isTextEntryTarget(event.target)) return false;
  // Focus inside an open popover (model picker, attachment menu): moving it
  // away would close the popover.
  if (event.target?.closest?.(POPOVER)) return false;
  const overlays = Array.from(doc.querySelectorAll(OVERLAYS)).filter((el) => !composerRoot?.contains(el));
  if (overlays.some(isShown)) return false;
  return true;
}
