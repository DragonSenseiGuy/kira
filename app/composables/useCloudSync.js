import localforage from "localforage";
import { ref } from "vue";

const userId = ref(null);
const syncEnabled = ref(false);
const syncing = ref(false);

const USER_ID_KEY = "kira_user_id";

/**
 * Cloud sync composable for PostgreSQL-backed chat storage.
 * Works alongside the existing localforage storage - localforage remains
 * the primary store, and this syncs changes to the server.
 */
export function useCloudSync() {
  /**
   * Initialize cloud sync - gets or creates a user ID
   */
  async function initSync() {
    try {
      // Check if we already have a user ID stored locally
      let storedUserId = await localforage.getItem(USER_ID_KEY);

      if (storedUserId) {
        // Ensure user exists on server
        const res = await fetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: storedUserId }),
        });

        if (res.ok) {
          const data = await res.json();
          userId.value = data.user.id;
          syncEnabled.value = true;
        }
      } else {
        // Create new user
        const res = await fetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });

        if (res.ok) {
          const data = await res.json();
          userId.value = data.user.id;
          await localforage.setItem(USER_ID_KEY, data.user.id);
          syncEnabled.value = true;
        }
      }
    } catch (error) {
      console.warn("[CloudSync] Failed to initialize, running in local-only mode:", error.message);
      syncEnabled.value = false;
    }
  }

  /**
   * Save a conversation to the cloud (create or update)
   */
  async function syncConversation(conversationId, data) {
    if (!syncEnabled.value || !userId.value) return;

    syncing.value = true;
    try {
      const payload = {
        user_id: userId.value,
        id: conversationId,
        title: data.title || "Untitled",
        messages: data.messages || [],
        branch_path: data.branchPath || [],
      };

      const res = await fetch(`/api/conversations/${conversationId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.status === 404) {
        // Conversation doesn't exist on server yet, create it
        await fetch("/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
    } catch (error) {
      console.warn("[CloudSync] Failed to sync conversation:", error.message);
    } finally {
      syncing.value = false;
    }
  }

  /**
   * Create a new conversation in the cloud
   */
  async function cloudCreateConversation(conversationId, data) {
    if (!syncEnabled.value || !userId.value) return;

    try {
      await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId.value,
          id: conversationId,
          title: data.title || "Untitled",
          messages: data.messages || [],
          branch_path: data.branchPath || [],
        }),
      });
    } catch (error) {
      console.warn("[CloudSync] Failed to create conversation:", error.message);
    }
  }

  /**
   * Delete a conversation from the cloud
   */
  async function cloudDeleteConversation(conversationId) {
    if (!syncEnabled.value || !userId.value) return;

    try {
      await fetch(`/api/conversations/${conversationId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId.value }),
      });
    } catch (error) {
      console.warn("[CloudSync] Failed to delete conversation:", error.message);
    }
  }

  /**
   * Load a conversation from the cloud
   */
  async function cloudLoadConversation(conversationId) {
    if (!syncEnabled.value || !userId.value) return null;

    try {
      const res = await fetch(
        `/api/conversations/${conversationId}?user_id=${userId.value}`
      );
      if (res.ok) {
        return await res.json();
      }
      return null;
    } catch (error) {
      console.warn("[CloudSync] Failed to load conversation:", error.message);
      return null;
    }
  }

  /**
   * Load all conversation metadata from the cloud
   */
  async function cloudLoadConversations() {
    if (!syncEnabled.value || !userId.value) return [];

    try {
      const res = await fetch(
        `/api/conversations?user_id=${userId.value}`
      );
      if (res.ok) {
        const data = await res.json();
        return data.conversations || [];
      }
      return [];
    } catch (error) {
      console.warn("[CloudSync] Failed to load conversations list:", error.message);
      return [];
    }
  }

  /**
   * Full sync: push all local conversations to the cloud.
   * Useful for initial migration from local-only to cloud.
   */
  async function pushAllToCloud() {
    if (!syncEnabled.value || !userId.value) return;

    syncing.value = true;
    try {
      const metadata = (await localforage.getItem("conversations_metadata")) || [];

      for (const conv of metadata) {
        const data = await localforage.getItem(`conversation_${conv.id}`);
        if (data) {
          await syncConversation(conv.id, data);
        }
      }

      console.log("[CloudSync] All local conversations pushed to cloud");
    } catch (error) {
      console.error("[CloudSync] Error pushing to cloud:", error);
    } finally {
      syncing.value = false;
    }
  }

  return {
    userId,
    syncEnabled,
    syncing,
    initSync,
    syncConversation,
    cloudCreateConversation,
    cloudDeleteConversation,
    cloudLoadConversation,
    cloudLoadConversations,
    pushAllToCloud,
  };
}
