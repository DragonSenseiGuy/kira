import localforage from "localforage";
import { emitter } from "~/composables/emitter";
import { useSettings } from "~/composables/useSettings";

// Which account this device's cached chats and API key belong to. Unset means
// the cache predates accounts, and is adopted by the first user to sign in.
const CACHE_OWNER_KEY = "kira_cache_owner";

/**
 * Wipes the locally cached chats.
 *
 * Chats live in localforage keyed by conversation id, with no notion of who
 * they belong to. On a shared device that would mean the next person to sign
 * in sees the previous account's conversations — and syncs them up into their
 * own account. Clearing on sign-out keeps accounts separate; the chats
 * themselves are safe in the database and come back on the next sign-in.
 */
export async function clearLocalChats() {
  try {
    const metadata =
      (await localforage.getItem("conversations_metadata")) || [];

    await Promise.all(
      metadata.map((conv) => localforage.removeItem(`conversation_${conv.id}`))
    );
    await localforage.removeItem("conversations_metadata");

    emitter.emit("updateConversations");
  } catch (error) {
    console.warn("[auth] Could not clear local chats:", error.message);
  }
}

/**
 * Removes the API key this device has cached.
 *
 * Same reasoning as the chats: the key belongs to whoever was signed in, and
 * leaving it behind would let the next person spend someone else's quota. The
 * account's own copy is untouched, so it comes back on the next sign-in.
 */
export async function clearLocalApiKey() {
  try {
    const settingsManager = useSettings();
    settingsManager.setSetting("custom_api_key", "");
    await settingsManager.saveSettings();
  } catch (error) {
    console.warn("[auth] Could not clear the local API key:", error.message);
  }
}

/**
 * Claims this device for a user, wiping anything left by a different account
 * first — someone who closed the tab without signing out, say.
 *
 * This has to finish before any sync runs, or the new user's sync could pick
 * up the previous user's chats and key and push them into the wrong account.
 *
 * @param {string} userId
 */
export async function adoptDeviceForUser(userId) {
  try {
    const previousOwner = await localforage.getItem(CACHE_OWNER_KEY);

    if (previousOwner && previousOwner !== userId) {
      await clearLocalChats();
      await clearLocalApiKey();
    }

    await localforage.setItem(CACHE_OWNER_KEY, userId);
  } catch (error) {
    console.warn("[auth] Could not check who this device belongs to:", error.message);
  }
}
