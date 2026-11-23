import { ref, computed, watch, onMounted, onBeforeUnmount } from "vue";
import localforage from "localforage";
import { emitter } from "./emitter";
import { isImeKey } from "~/utils/ime";
import { findSnippet } from "../utils/chatSearch";
import { deleteConversation as deleteConv, loadConversation, duplicateConversation, renameConversation } from "./storeConversations";
import { downloadConversationMarkdown } from "~/utils/conversationMarkdown";
import { confirmDialog } from "./useDialogs";

/**
 * Groups conversations by time periods
 * @param {Date} lastUpdated - The conversation's last updated date
 * @returns {string} Group key
 */
function getTimeGroup(lastUpdated) {
  if (!lastUpdated) return "older";

  const now = new Date();
  const date = new Date(lastUpdated);
  const diffMs = now - date;
  const diffHours = diffMs / (1000 * 60 * 60);
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffHours < 24) {
    return "today";
  } else if (diffHours < 48) {
    return "yesterday";
  } else if (diffDays < 7) {
    return "thisWeek";
  } else if (diffDays < 30) {
    return "thisMonth";
  }
  return "older";
}

/**
 * Gets display label for a time group
 * @param {string} groupKey - The group key
 * @returns {string} Human-readable label
 */
function getGroupLabel(groupKey) {
  const labels = {
    pinned: "Pinned",
    today: "Today",
    yesterday: "Yesterday",
    thisWeek: "This Week",
    thisMonth: "This Month",
    older: "Older",
    archived: "Archived"
  };
  return labels[groupKey] || groupKey;
}

/**
 * Gets order priority for groups (lower = higher priority)
 * @param {string} groupKey - The group key
 * @returns {number} Priority order
 */
function getGroupOrder(groupKey) {
  const order = {
    pinned: 0,
    today: 1,
    yesterday: 2,
    thisWeek: 3,
    thisMonth: 4,
    older: 5,
    archived: 6
  };
  return order[groupKey] ?? 99;
}

/**
 * Groups conversations for the sidebar: pinned first, then by age, with
 * archived conversations in their own group at the end.
 *
 * @param {Array<Object>} conversations  Sidebar metadata entries.
 * @returns {Array<{key: string, label: string, conversations: Array<Object>}>}
 */
export function groupConversations(conversations) {
    const groups = {};

    // Sort by createdAt (most recently created first), falling back to lastUpdated for older entries
    const sorted = [...conversations].sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt) : (a.lastUpdated ? new Date(a.lastUpdated) : new Date(0));
      const dateB = b.createdAt ? new Date(b.createdAt) : (b.lastUpdated ? new Date(b.lastUpdated) : new Date(0));
      return dateB - dateA;
    });

    // Group conversations
    for (const conv of sorted) {
      let groupKey;
      if (conv.archived) {
        groupKey = "archived";
      } else if (conv.pinned) {
        groupKey = "pinned";
      } else {
        groupKey = getTimeGroup(conv.createdAt ?? conv.lastUpdated);
      }

      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(conv);
    }

    // Sort groups by priority
    const sortedGroups = Object.entries(groups)
      .sort(([keyA], [keyB]) => getGroupOrder(keyA) - getGroupOrder(keyB))
      .map(([key, conversations]) => ({
        key,
        label: getGroupLabel(key),
        conversations
      }));

    return sortedGroups;
  }

/**
 * Composable for managing conversations list with grouping, search, and pinning
 * @returns {Object} Conversations list state and methods
 */
export function useConversationsList() {
  const metadata = ref([]);
  const searchQuery = ref("");
  const renamingId = ref(null);
  const newTitle = ref("");

  // Load conversations from storage
  async function updateConversations() {
    const stored = await localforage.getItem("conversations_metadata");
    metadata.value = stored || [];
  }

  // Initial load
  updateConversations();

  // Listen for updates from other parts of the app
  emitter.on("updateConversations", updateConversations);

  // The command palette acts on the open chat without knowing its title.
  function renameById(id) {
    const conversation = metadata.value.find(conv => conv.id === id);
    if (!conversation) return;
    // A search that hides the chat would leave no title field to type in.
    searchQuery.value = "";
    startRename(id, conversation.title);
  }
  emitter.on("renameConversation", renameById);
  emitter.on("togglePinConversation", togglePin);

  onBeforeUnmount(() => {
    emitter.off("updateConversations", updateConversations);
    clearTimeout(searchTimer);
    searchRun++;
    emitter.off("renameConversation", renameById);
    emitter.off("togglePinConversation", togglePin);
  });

  // Computed: Filter conversations by search query
  const filteredConversations = computed(() => {
    if (!searchQuery.value.trim()) {
      return metadata.value;
    }
    const query = searchQuery.value.toLowerCase().trim();
    return metadata.value.filter(conv =>
      conv.title?.toLowerCase().includes(query) || contentMatches.value.has(conv.id)
    );
  });

  // Chats whose text contains the query, with the snippet to show under the
  // title. Filled in a moment after typing stops; title matches show at once.
  const contentMatches = ref(new Map());
  let searchRun = 0;
  let searchTimer = null;

  async function searchContent(query, run) {
    const matches = new Map();
    for (const conv of metadata.value) {
      const stored = await localforage.getItem(`conversation_${conv.id}`);
      if (run !== searchRun) return;
      const snippet = findSnippet(stored?.messages, query);
      if (snippet) matches.set(conv.id, snippet);
    }
    contentMatches.value = matches;
  }

  watch([searchQuery, metadata], () => {
    clearTimeout(searchTimer);
    const run = ++searchRun;
    const query = searchQuery.value.trim();
    if (!query) {
      contentMatches.value = new Map();
      return;
    }
    searchTimer = setTimeout(() => searchContent(query, run), 200);
  });

  // Computed: Group conversations by time and pinned status
  const groupedConversations = computed(() => groupConversations(filteredConversations.value));

  // Check if search is active
  const isSearching = computed(() => searchQuery.value.trim().length > 0);

  // Toggle pin status
  async function togglePin(id) {
    try {
      const storedMetadata = await localforage.getItem("conversations_metadata");
      if (storedMetadata) {
        const updatedMetadata = storedMetadata.map(conv =>
          conv.id === id ? { ...conv, pinned: !conv.pinned } : conv
        );
        await localforage.setItem("conversations_metadata", updatedMetadata);
        metadata.value = updatedMetadata;
        emitter.emit("updateConversations");
      }
    } catch (error) {
      console.error("Error toggling pin:", error);
    }
  }

  // Archive or restore a conversation. Archiving also unpins it.
  async function toggleArchive(id) {
    try {
      const storedMetadata = await localforage.getItem("conversations_metadata");
      if (storedMetadata) {
        const updatedMetadata = storedMetadata.map(conv =>
          conv.id === id
            ? { ...conv, archived: !conv.archived, pinned: conv.archived ? conv.pinned : false }
            : conv
        );
        await localforage.setItem("conversations_metadata", updatedMetadata);
        metadata.value = updatedMetadata;
        emitter.emit("updateConversations");
      }
    } catch (error) {
      console.error("Error archiving conversation:", error);
    }
  }

  // Delete conversation
  async function handleDelete(id, title = "") {
    const name = String(title || "").trim();
    const ok = await confirmDialog({
      title: "Delete chat?",
      message:
        (name ? `"${name.length > 80 ? name.slice(0, 80) + "…" : name}" will be deleted.` : "This chat will be deleted.") +
        "\n\nThis cannot be undone.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;

    try {
      await deleteConv(id);
      await updateConversations();
    } catch (error) {
      console.error("Error deleting conversation:", error);
    }
  }

  // Download one conversation as a Markdown file
  async function exportMarkdown(id, title) {
    try {
      const conversation = await loadConversation(id);
      if (!conversation) return;
      downloadConversationMarkdown({ ...conversation, title });
    } catch (error) {
      console.error("Error exporting conversation:", error);
    }
  }

  /** Copies a conversation and returns the id of the copy (null on failure). */
  async function handleDuplicate(id) {
    try {
      const copyId = await duplicateConversation(id);
      await updateConversations();
      return copyId;
    } catch (error) {
      console.error("Error duplicating conversation:", error);
      return null;
    }
  }

  // Rename functions
  function startRename(id, currentTitle) {
    renamingId.value = id;
    newTitle.value = currentTitle;
  }

  function cancelRename() {
    renamingId.value = null;
    newTitle.value = "";
  }

  async function saveRename(id) {
    if (renamingId.value !== id) return;
    const title = newTitle.value.trim();
    cancelRename();
    if (!title) return;

    try {
      await renameConversation(id, title);
    } catch (error) {
      console.error("Error renaming conversation:", error);
    }
  }

  function handleRenameKeydown(event, id) {
    if (isImeKey(event)) return;
    if (event.key === "Enter") {
      saveRename(id);
    } else if (event.key === "Escape") {
      cancelRename();
    }
  }

  // Clear search
  function clearSearch() {
    searchQuery.value = "";
  }

  return {
    // State
    metadata,
    searchQuery,
    contentMatches,
    renamingId,
    newTitle,

    // Computed
    groupedConversations,
    filteredConversations,
    isSearching,

    // Methods
    updateConversations,
    togglePin,
    toggleArchive,
    handleDelete,
    exportMarkdown,
    handleDuplicate,
    startRename,
    cancelRename,
    saveRename,
    handleRenameKeydown,
    clearSearch
  };
}