/**
 * @file useMessageSearch.js
 * @description Storage-backed wrapper around `messageSearch.js`.
 *
 * Builds (and incrementally refreshes) a compact in-memory index of every
 * stored conversation so the command palette can search message bodies without
 * re-reading IndexedDB on every keystroke.
 */

import { ref, shallowRef, onBeforeUnmount } from "vue";
import localforage from "localforage";
import { emitter } from "./emitter";
import { buildConversationIndex, searchConversations } from "./messageSearch";

/**
 * Module-level index shared by every consumer. Entries are keyed by
 * conversation id and reused across rebuilds when the conversation has not
 * changed, so opening the palette after a long session is cheap.
 * @type {Map<string, Object>}
 */
const indexCache = new Map();

/** Set when storage changes; the next search rebuilds before running. */
let indexDirty = true;

/** Deduplicates concurrent rebuilds (palette open + fast typing). */
let rebuildPromise = null;

function markIndexDirty() {
  indexDirty = true;
}

emitter.on("updateConversations", markIndexDirty);
emitter.on("conversationDeleted", markIndexDirty);

/**
 * Rebuilds the index from storage, reusing cache entries whose conversation
 * metadata is unchanged.
 *
 * @returns {Promise<Array<Object>>} All index entries.
 */
async function rebuildIndex() {
  const metadata = (await localforage.getItem("conversations_metadata")) || [];
  const entries = [];
  const liveIds = new Set();

  for (const meta of metadata) {
    if (!meta?.id) continue;
    liveIds.add(meta.id);

    const cached = indexCache.get(meta.id);
    const stamp = `${meta.lastUpdated ?? ""}|${meta.title ?? ""}`;
    if (cached && cached._stamp === stamp) {
      entries.push(cached);
      continue;
    }

    let record;
    try {
      record = await localforage.getItem(`conversation_${meta.id}`);
    } catch (error) {
      console.error(`[messageSearch] Failed to read conversation ${meta.id}:`, error);
      continue;
    }
    if (!record) continue;

    const entry = buildConversationIndex(meta.id, {
      ...record,
      title: meta.title || record.title,
      lastUpdated: meta.lastUpdated ?? record.lastUpdated,
    });
    entry._stamp = stamp;
    indexCache.set(meta.id, entry);
    entries.push(entry);
  }

  // Drop entries for conversations that no longer exist.
  for (const id of [...indexCache.keys()]) {
    if (!liveIds.has(id)) indexCache.delete(id);
  }

  indexDirty = false;
  return entries;
}

/**
 * Returns the current index, rebuilding it first if storage changed.
 * @returns {Promise<Array<Object>>}
 */
export async function getSearchIndex() {
  if (!indexDirty) return [...indexCache.values()];
  if (!rebuildPromise) {
    rebuildPromise = rebuildIndex().finally(() => {
      rebuildPromise = null;
    });
  }
  return rebuildPromise;
}

/** Forces a full rebuild on the next search. Exposed for tests and imports. */
export function invalidateSearchIndex() {
  indexCache.clear();
  indexDirty = true;
}

/**
 * Reactive full-text search over all stored conversations.
 *
 * @param {Object} [options]
 * @param {number} [options.debounceMs=140] - Keystroke debounce.
 * @param {number} [options.limit=30] - Maximum results.
 * @returns {Object} `{ results, isSearching, search, clear }`
 */
export function useMessageSearch(options = {}) {
  const { debounceMs = 140, limit = 30 } = options;

  const results = shallowRef([]);
  const isSearching = ref(false);

  let timer = null;
  // Monotonic token so a slow rebuild can never overwrite newer results.
  let requestId = 0;

  async function run(query) {
    const id = ++requestId;
    if (!query || !query.trim()) {
      results.value = [];
      isSearching.value = false;
      return;
    }

    isSearching.value = true;
    try {
      const index = await getSearchIndex();
      if (id !== requestId) return;
      results.value = searchConversations(index, query, { limit });
    } catch (error) {
      console.error("[messageSearch] Search failed:", error);
      if (id === requestId) results.value = [];
    } finally {
      if (id === requestId) isSearching.value = false;
    }
  }

  /**
   * Debounced search entry point.
   * @param {string} query - The raw query.
   */
  function search(query) {
    if (timer) clearTimeout(timer);
    if (!query || !query.trim()) {
      requestId++;
      results.value = [];
      isSearching.value = false;
      return;
    }
    timer = setTimeout(() => run(query), debounceMs);
  }

  function clear() {
    if (timer) clearTimeout(timer);
    requestId++;
    results.value = [];
    isSearching.value = false;
  }

  onBeforeUnmount(() => {
    if (timer) clearTimeout(timer);
  });

  return { results, isSearching, search, clear };
}
