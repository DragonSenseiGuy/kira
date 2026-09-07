import { computed, ref } from 'vue';

/**
 * The right-hand dock, modelled as one value.
 *
 * Both docks live on the same edge, so a single ref names whichever occupies
 * it: `null | 'parameters' | 'workspace'`. Assignment *is* mutual exclusion —
 * there is no state where both are open to guard against.
 *
 * Availability is part of the model rather than a gate bolted onto every
 * reader: a dock whose predicate is false reads as closed by construction, so
 * nothing has to remember to close it when the predicate flips (e.g. turning
 * Developer Mode off while the parameter dock is open).
 *
 * The occupied dock is deliberately not exposed raw: `openDock` is the only
 * reading of the state that accounts for availability, so it is the only one
 * callers get.
 *
 * @param {Record<string, () => boolean>} available - Predicate per dock id.
 * @returns {{
 *   openDock: import('vue').ComputedRef<string|null>,
 *   toggleDock: (dock: string) => void,
 *   closeDock: () => void,
 * }}
 */
export function useDock(available) {
  const isAvailable = (dock) => !!dock && (available[dock]?.() ?? false);

  // Which dock has been asked for, before availability is applied.
  const occupied = ref(null);

  // The dock that is actually open: an unavailable dock is closed by
  // construction, so nothing has to remember to close it.
  const openDock = computed(() => (isAvailable(occupied.value) ? occupied.value : null));

  /**
   * Opens `dock`, or closes it if it is the one already open. Writing an
   * unavailable dock is a no-op, so an inert shortcut cannot leave a value
   * behind that springs open later when the dock becomes available.
   *
   * @param {string} dock - Dock id.
   */
  function toggleDock(dock) {
    occupied.value = openDock.value === dock || !isAvailable(dock) ? null : dock;
  }

  /** Closes whatever dock is open. */
  function closeDock() {
    occupied.value = null;
  }

  return { openDock, toggleDock, closeDock };
}
