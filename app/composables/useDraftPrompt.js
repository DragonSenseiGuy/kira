import { ref, watch } from 'vue';
import localforage from 'localforage';
import { useGlobalIncognito } from './useGlobalIncognito';

const DRAFT_KEY_PREFIX = 'draft:';
const DEBOUNCE_MS = 300;

/**
 * Manages per-conversation draft prompt persistence in localForage.
 * Auto-saves with a 300ms debounce and loads on mount.
 *
 * @param {import('vue').Ref<string>} conversationIdRef - Reactive conversation ID (empty for new)
 * @param {import('vue').Ref<string>} inputRef - Reactive input string to sync
 * @param {{isEphemeral?: import('vue').Ref<boolean>}} [options] - When the ref is
 *   true nothing is saved or restored. Defaults to the incognito state.
 * @returns {Object} Draft manager API
 */
export function useDraftPrompt(conversationIdRef, inputRef, options = {}) {
  // Incognito chats leave nothing behind, and that includes unsent text.
  const isEphemeral = options.isEphemeral ?? useGlobalIncognito().isIncognito;
  let saveTimeout = null;
  let isRestoring = false;

  /**
   * Build the storage key for a given conversation ID.
   */
  function getKey(id) {
    return `${DRAFT_KEY_PREFIX}${id || 'new'}`;
  }

  /**
   * Load draft for the current conversation into inputRef.
   */
  async function loadDraft() {
    if (isEphemeral.value) {
      // Start empty rather than restoring a stored draft into a private chat.
      inputRef.value = '';
      return;
    }
    isRestoring = true;
    try {
      const key = getKey(conversationIdRef.value);
      const saved = await localforage.getItem(key);
      inputRef.value = typeof saved === 'string' ? saved : '';
    } finally {
      // Clear flag on next tick so the watcher doesn't immediately re-save
      requestAnimationFrame(() => {
        isRestoring = false;
      });
    }
  }

  /**
   * Persist the current input to localForage.
   */
  async function saveDraft() {
    if (isEphemeral.value) return;
    const key = getKey(conversationIdRef.value);
    await localforage.setItem(key, inputRef.value);
  }

  /**
   * Clear the draft for the current conversation.
   */
  async function clearDraft() {
    // The stored draft belongs to the normal chat; an incognito send leaves it.
    if (isEphemeral.value) return;
    const key = getKey(conversationIdRef.value);
    await localforage.removeItem(key);
  }

  /**
   * Debounced save triggered by input changes.
   */
  function debouncedSave() {
    if (isRestoring) return;
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      saveDraft();
    }, DEBOUNCE_MS);
  }

  // Entering incognito: a save scheduled just before must not land.
  watch(isEphemeral, (ephemeral) => {
    if (ephemeral) clearTimeout(saveTimeout);
    // Leaving incognito with an empty composer: bring back the stored draft
    // that was not restored while private. Live input is never replaced.
    else if (!inputRef.value) restoreAfterIncognito();
  });

  /**
   * Restores the stored draft once incognito ends, unless the user typed,
   * switched chat or went private again while it was being read.
   */
  async function restoreAfterIncognito() {
    const conversationId = conversationIdRef.value;
    const saved = await localforage.getItem(getKey(conversationId));
    if (typeof saved !== 'string' || !saved) return;
    if (inputRef.value || isEphemeral.value || conversationIdRef.value !== conversationId) return;
    isRestoring = true;
    inputRef.value = saved;
    requestAnimationFrame(() => {
      isRestoring = false;
    });
  }

  // Watch input changes and auto-save
  watch(inputRef, debouncedSave);

  // Watch conversation changes: save old draft, load new one.
  // `immediate: true` also restores the draft on initial mount.
  watch(conversationIdRef, async (newId, oldId) => {
    if (oldId !== undefined && !isRestoring && !isEphemeral.value) {
      // Save previous conversation's draft before switching
      const oldKey = getKey(oldId);
      await localforage.setItem(oldKey, inputRef.value);
    }
    await loadDraft();
  }, { immediate: true });

  return {
    loadDraft,
    saveDraft,
    clearDraft
  };
}