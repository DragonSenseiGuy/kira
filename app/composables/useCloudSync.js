import localforage from "localforage";
import { ref } from "vue";
import { emitter } from "~/composables/emitter";
import { useAuth } from "~/composables/useAuth";

/**
 * Cloud sync for account-backed chat storage.
 *
 * localforage stays the primary store — the app keeps working offline and
 * local-only — and this mirrors changes to the signed-in user's account.
 * The account cookie authenticates every request, so no user id is ever sent
 * from the client.
 */

const syncing = ref(false);
const lastError = ref("");

/** True only when there's an account to sync to. */
function canSync() {
  const { accountsEnabled, user } = useAuth();
  return accountsEnabled.value && !!user.value;
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  return res;
}

export function useCloudSync() {
  /**
   * Pushes a conversation to the account, creating it if the server
   * doesn't have it yet.
   * @param {string} conversationId
   * @param {{title?: string, messages?: Array, branchPath?: Array}} data
   */
  async function syncConversation(conversationId, data) {
    if (!canSync()) return;

    syncing.value = true;
    try {
      const payload = {
        title: data.title || "Untitled",
        messages: data.messages || [],
        branch_path: data.branchPath || [],
      };

      const res = await api(`/api/conversations/${conversationId}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });

      if (res.status === 404) {
        await api("/api/conversations", {
          method: "POST",
          body: JSON.stringify({ id: conversationId, ...payload }),
        });
      }
    } catch (error) {
      lastError.value = error.message;
      console.warn("[CloudSync] Failed to sync conversation:", error.message);
    } finally {
      syncing.value = false;
    }
  }

  /**
   * @param {string} conversationId
   * @param {{title?: string, messages?: Array, branchPath?: Array}} data
   */
  async function cloudCreateConversation(conversationId, data) {
    if (!canSync()) return;

    try {
      await api("/api/conversations", {
        method: "POST",
        body: JSON.stringify({
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
   * @param {string} conversationId
   */
  async function cloudDeleteConversation(conversationId) {
    if (!canSync()) return;

    try {
      await api(`/api/conversations/${conversationId}`, { method: "DELETE" });
    } catch (error) {
      console.warn("[CloudSync] Failed to delete conversation:", error.message);
    }
  }

  /**
   * @param {string} conversationId
   * @returns {Promise<object|null>}
   */
  async function cloudLoadConversation(conversationId) {
    if (!canSync()) return null;

    try {
      const res = await api(`/api/conversations/${conversationId}`);
      return res.ok ? await res.json() : null;
    } catch (error) {
      console.warn("[CloudSync] Failed to load conversation:", error.message);
      return null;
    }
  }

  /**
   * @returns {Promise<Array<object>>}
   */
  async function cloudLoadConversations() {
    if (!canSync()) return [];

    try {
      const res = await api("/api/conversations");
      if (!res.ok) return [];
      const data = await res.json();
      return data.conversations || [];
    } catch (error) {
      console.warn("[CloudSync] Failed to load conversations:", error.message);
      return [];
    }
  }

  /**
   * Pushes every local conversation to the account. Used the first time
   * someone signs in on a device that already has local chats.
   */
  async function pushAllToCloud() {
    if (!canSync()) return;

    syncing.value = true;
    try {
      const metadata =
        (await localforage.getItem("conversations_metadata")) || [];

      for (const conv of metadata) {
        const data = await localforage.getItem(`conversation_${conv.id}`);
        if (data) await syncConversation(conv.id, data);
      }
    } catch (error) {
      console.error("[CloudSync] Error pushing to cloud:", error);
    } finally {
      syncing.value = false;
    }
  }

  /**
   * Pulls the account's chats into local storage, then pushes anything the
   * account doesn't have yet. Called once after sign-in so a chat started on
   * one device shows up on the next.
   */
  async function hydrateFromCloud() {
    if (!canSync()) return;

    syncing.value = true;
    try {
      const remote = await cloudLoadConversations();
      const localMetadata =
        (await localforage.getItem("conversations_metadata")) || [];
      const localById = new Map(localMetadata.map((m) => [m.id, m]));

      let metadataChanged = false;

      for (const summary of remote) {
        const local = localById.get(summary.id);
        const remoteUpdated = new Date(summary.lastUpdated).getTime();
        const localUpdated = local ? new Date(local.lastUpdated).getTime() : 0;

        // Local edits are never clobbered — only pull what's newer.
        if (local && localUpdated >= remoteUpdated) continue;

        const full = await cloudLoadConversation(summary.id);
        if (!full) continue;

        await localforage.setItem(`conversation_${full.id}`, {
          title: full.title,
          lastUpdated: full.lastUpdated,
          messages: full.messages || [],
          branchPath: full.branchPath || [],
        });

        const entry = {
          id: full.id,
          title: full.title,
          lastUpdated: full.lastUpdated,
          createdAt: full.createdAt,
        };

        if (local) {
          Object.assign(local, entry);
        } else {
          localMetadata.push(entry);
          localById.set(entry.id, entry);
        }
        metadataChanged = true;
      }

      if (metadataChanged) {
        await localforage.setItem("conversations_metadata", localMetadata);
        emitter.emit("updateConversations");
      }

      // Anything local the account has never seen goes up.
      const remoteIds = new Set(remote.map((c) => c.id));
      for (const conv of localMetadata) {
        if (remoteIds.has(conv.id)) continue;
        const data = await localforage.getItem(`conversation_${conv.id}`);
        if (data) await cloudCreateConversation(conv.id, data);
      }
    } catch (error) {
      console.error("[CloudSync] Hydration failed:", error);
    } finally {
      syncing.value = false;
    }
  }

  return {
    syncing,
    lastError,
    canSync,
    syncConversation,
    cloudCreateConversation,
    cloudDeleteConversation,
    cloudLoadConversation,
    cloudLoadConversations,
    pushAllToCloud,
    hydrateFromCloud,
  };
}
