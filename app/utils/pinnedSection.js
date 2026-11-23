const KEY = "kira:pinned-collapsed";

/**
 * Whether the sidebar's Pinned group was left open. Open unless it was
 * explicitly collapsed, and open when storage cannot be read.
 *
 * @param {Storage} [storage]
 * @returns {boolean}
 */
export function loadPinnedExpanded(storage) {
  try {
    // Reading `localStorage` itself can throw when the browser blocks storage.
    return (storage ?? globalThis.localStorage).getItem(KEY) !== "1";
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
export function savePinnedExpanded(expanded, storage) {
  try {
    const store = storage ?? globalThis.localStorage;
    if (expanded) store.removeItem(KEY);
    else store.setItem(KEY, "1");
  } catch {
    // Private browsing or a full store: the choice just lasts for this visit.
  }
}
