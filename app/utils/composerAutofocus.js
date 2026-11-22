// Sidebar controls whose whole job is to take the user to a chat: once they
// are used, focus may move on to the composer.
const NAVIGATION = ".conversation-button, #new-chat-button";

/**
 * Whether the composer may take focus by itself: on arriving at a chat and
 * when a reply ends. Only when focus is nowhere in particular, so it is never
 * pulled out of a dialog, menu, or field, and never on a touch screen, where
 * it would raise the on-screen keyboard.
 *
 * @param {Document} [doc]
 * @param {Window} [win]
 * @returns {boolean}
 */
export function canAutofocusComposer(doc = document, win = window) {
  if (win.matchMedia?.("(pointer: coarse)").matches) return false;
  // Focusing a field would drop text the user has selected in a reply.
  const selection = win.getSelection?.();
  if (selection && !selection.isCollapsed) return false;
  const active = doc.activeElement;
  return !active || active === doc.body || !!active.matches?.(NAVIGATION);
}
