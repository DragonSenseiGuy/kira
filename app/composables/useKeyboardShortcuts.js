/**
 * @file useKeyboardShortcuts.js
 * @description Binds the shortcut registry to a `keydown` listener.
 */

import { onMounted, onBeforeUnmount } from "vue";
import { SHORTCUTS, findShortcut } from "./keyboardShortcuts";

/**
 * Detects whether `mod` should mean Meta (Mac) or Ctrl.
 * @returns {boolean}
 */
export function isMacPlatform() {
  if (typeof navigator === "undefined") return false;
  const platform = navigator.userAgentData?.platform || navigator.platform || navigator.userAgent;
  return /mac|iphone|ipad|ipod/i.test(platform || "");
}

/**
 * Attaches the global shortcut listener for the lifetime of the calling
 * component.
 *
 * @param {Record<string, Function>} handlers - Keyed by a registry entry's
 *   `action`. Entries without a handler are ignored.
 * @param {Object} [options]
 * @param {Array<Object>} [options.shortcuts=SHORTCUTS] - Registry to bind.
 * @returns {{isMac: boolean}} Platform info, so callers can label keys.
 */
export function useKeyboardShortcuts(handlers = {}, options = {}) {
  const { shortcuts = SHORTCUTS } = options;
  const isMac = isMacPlatform();

  function onKeydown(event) {
    // Ignore the synthetic keydown browsers emit while an IME is composing.
    if (event.isComposing || event.keyCode === 229) return;

    const shortcut = findShortcut(event, { isMac, shortcuts });
    if (!shortcut) return;

    const handler = handlers[shortcut.action];
    if (typeof handler !== "function") return;

    // Claim the chord so the browser doesn't also act on it (Ctrl+K focuses
    // Chrome's address bar, for one).
    event.preventDefault();
    handler(event);
  }

  onMounted(() => {
    window.addEventListener("keydown", onKeydown);
  });

  onBeforeUnmount(() => {
    window.removeEventListener("keydown", onKeydown);
  });

  return { isMac };
}
