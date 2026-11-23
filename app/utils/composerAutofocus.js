// Sidebar controls whose whole job is to take the user to a chat: once they
// are used, focus may move on to the composer.
const NAVIGATION = ".conversation-button, #new-chat-button, [data-opens-chat]";

/**
 * Whether the composer may take focus by itself: on arriving at a chat and
 * when a reply ends. Only when focus is nowhere in particular, so it is never
 * pulled out of a dialog, menu, or field, and never on a touch screen, where
 * it would raise the on-screen keyboard.
 *
 * @param {object} [options]
 * @param {boolean} [options.arrived] True when a chat has just been opened:
 *   focus may then also leave the control that opened it. Not when a reply
 *   ends, since the user may by then be tabbing through the sidebar.
 * @param {Document} [doc]
 * @param {Window} [win]
 * @returns {boolean}
 */
export function canAutofocusComposer({ arrived = false } = {}, doc = document, win = window) {
  if (win.matchMedia?.("(pointer: coarse)").matches) return false;
  // Focusing a field would drop text the user has selected in a reply.
  const selection = win.getSelection?.();
  if (selection && !selection.isCollapsed) return false;
  const active = doc.activeElement;
  if (!active || active === doc.body) return true;
  return arrived && !!active.matches?.(NAVIGATION);
}
