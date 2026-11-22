const KEY = "kira:pinned-collapsed";

/**
 * Whether the sidebar's Pinned group was left open. Open unless it was
 * explicitly collapsed, and open when storage cannot be read.
 *
 * @param {Storage} [storage]
 * @returns {boolean}
 */
export function loadPinnedExpanded(storage = globalThis.localStorage) {
  try {
    return storage.getItem(KEY) !== "1";
  } catch {
    return true;
  }
}

/**
 * Remembers whether the Pinned group is open, for the next visit.
 *
 * @param {boolean} expanded
 * @param {Storage} [storage]
 */
export function savePinnedExpanded(expanded, storage = globalThis.localStorage) {
  try {
    if (expanded) storage.removeItem(KEY);
    else storage.setItem(KEY, "1");
  } catch {
    // Private browsing or a full store: the choice just lasts for this visit.
  }
}
